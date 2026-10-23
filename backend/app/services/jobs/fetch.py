"""Safe server-side job posting retrieval and ATS adapters.

Security properties:
- only http(s) URLs with standard ports and no embedded credentials;
- hostnames resolve only to globally routable addresses (blocks localhost,
  private networks and link-local metadata endpoints);
- every redirect target is re-validated;
- responses are size-capped and time-limited.

Only public ATS JSON APIs and ordinary public HTML pages are used. There is no
login, CAPTCHA, anti-bot or LinkedIn scraping, and failures are surfaced
honestly instead of guessed.
"""

from __future__ import annotations

import html as html_module
import ipaddress
import json
import re
import socket
from dataclasses import dataclass
from urllib.parse import parse_qs, quote, urljoin, urlsplit, urlunsplit

import httpx
from bs4 import BeautifulSoup

from ...config import get_settings
from ...errors import InvalidJobUrl, JobFetchFailed, UnsafeUrl
from ...schemas.job import ExtractionMethod, JobProfile
from .extract import structure_job

USER_AGENT = "AlignCV/0.1 (resume and job-description analyzer)"
REDIRECT_CODES = {301, 302, 303, 307, 308}
BLOCKED_HOST_SUFFIXES = (
    "localhost", ".localhost", ".local", ".internal", ".home", ".lan", ".corp",
    ".test", ".invalid", ".example",
)


@dataclass(frozen=True)
class AtsRef:
    kind: str
    company: str
    id: str
    api_url: str

    @property
    def platform(self) -> str:
        return self.kind


def validate_public_url(raw: str) -> str:
    """Validate and normalize a URL that the server is allowed to fetch."""
    cleaned = (raw or "").strip()
    if not cleaned:
        raise InvalidJobUrl("Enter a job posting URL.")
    if not re.match(r"^https?://", cleaned, re.IGNORECASE):
        raise InvalidJobUrl("Only public http(s) job posting URLs are supported.")
    try:
        parsed = urlsplit(cleaned)
        port = parsed.port
    except ValueError as exc:
        raise InvalidJobUrl("That URL could not be parsed.") from exc

    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise InvalidJobUrl("Only public http(s) job posting URLs are supported.")
    if parsed.username or parsed.password:
        raise UnsafeUrl("URLs with embedded credentials are not allowed.")

    host = (parsed.hostname or "").rstrip(".").lower()
    if not host:
        raise InvalidJobUrl("The URL has no hostname.")
    if any(host == suffix.lstrip(".") or host.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise UnsafeUrl("Local and internal hostnames are not allowed.")
    if port not in (None, 80, 443):
        raise UnsafeUrl("Only standard HTTP(S) ports are allowed.")

    literal = None
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if not literal.is_global:
            raise UnsafeUrl("Private, loopback and reserved addresses are not allowed.")
    else:
        if "." not in host:
            raise UnsafeUrl("Local and internal hostnames are not allowed.")
        try:
            infos = socket.getaddrinfo(host, port or (443 if scheme == "https" else 80), type=socket.SOCK_STREAM)
        except OSError as exc:
            raise JobFetchFailed(f"The host {host!r} could not be resolved.") from exc
        addresses = {str(info[4][0]).split("%", 1)[0] for info in infos}
        if not addresses:
            raise JobFetchFailed(f"The host {host!r} could not be resolved.")
        for address in addresses:
            try:
                resolved = ipaddress.ip_address(address)
            except ValueError as exc:
                raise UnsafeUrl("The host resolved to an invalid address.") from exc
            if not resolved.is_global:
                raise UnsafeUrl("The host resolves to a private or reserved address.")

    netloc = host
    default_port = 443 if scheme == "https" else 80
    if port is not None and port != default_port:
        netloc = f"{host}:{port}"
    return urlunsplit((scheme, netloc, parsed.path or "/", parsed.query, ""))


def fetch_text(
    url: str,
    *,
    accept: str = "text/html,application/xhtml+xml,application/json;q=0.8",
) -> tuple[str, str, str]:
    """Fetch a validated URL with manual redirect handling and hard limits."""
    settings = get_settings()
    current = validate_public_url(url)
    headers = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Language": "en"}
    try:
        with httpx.Client(
            timeout=settings.job_fetch_timeout_seconds,
            follow_redirects=False,
            headers=headers,
        ) as client:
            for redirect_count in range(settings.job_fetch_max_redirects + 1):
                try:
                    with client.stream("GET", current) as response:
                        if response.status_code in REDIRECT_CODES:
                            location = response.headers.get("location")
                            if not location:
                                raise JobFetchFailed("The site returned an incomplete redirect.")
                            if redirect_count >= settings.job_fetch_max_redirects:
                                raise JobFetchFailed("The site redirected too many times.")
                            current = validate_public_url(urljoin(current, location))
                            continue
                        if response.status_code in (401, 403):
                            raise JobFetchFailed(
                                "The site denied access (it may require login or block automated requests). "
                                "Paste the job description text instead."
                            )
                        if response.status_code >= 400:
                            raise JobFetchFailed(
                                f"The site returned HTTP {response.status_code}. "
                                "Paste the job description text instead."
                            )
                        declared = response.headers.get("content-length")
                        if declared and declared.isdigit() and int(declared) > settings.job_fetch_max_bytes:
                            raise JobFetchFailed("The job page is too large to import.")
                        chunks: list[bytes] = []
                        total = 0
                        for chunk in response.iter_bytes():
                            total += len(chunk)
                            if total > settings.job_fetch_max_bytes:
                                raise JobFetchFailed("The job page is too large to import.")
                            chunks.append(chunk)
                        if not chunks:
                            raise JobFetchFailed("The job page returned no content.")
                        content_type = response.headers.get("content-type", "")
                        encoding = response.encoding or "utf-8"
                        return b"".join(chunks).decode(encoding, "replace"), current, content_type
                except httpx.TimeoutException as exc:
                    raise JobFetchFailed("The site took too long to respond. Paste the description instead.") from exc
                except httpx.HTTPError as exc:
                    raise JobFetchFailed(
                        "The job page could not be fetched (network error, TLS failure or the site is offline). "
                        "Paste the description instead."
                    ) from exc
    except httpx.HTTPError as exc:
        raise JobFetchFailed("The job page could not be fetched. Paste the description instead.") from exc
    raise JobFetchFailed("The site redirected too many times.")


def _fetch_json(url: str) -> object:
    body, _, _ = fetch_text(url, accept="application/json")
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise JobFetchFailed("The ATS API returned an unexpected response.") from exc


def parse_ats_url(raw: str) -> AtsRef | None:
    try:
        parsed = urlsplit(raw.strip())
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    parts = [part for part in parsed.path.split("/") if part]

    def greenhouse(company: str, job_id: str) -> AtsRef:
        company_q = quote(company, safe="")
        id_q = quote(job_id, safe="")
        return AtsRef(
            kind="greenhouse",
            company=company,
            id=job_id,
            api_url=f"https://boards-api.greenhouse.io/v1/boards/{company_q}/jobs/{id_q}?questions=false",
        )

    if host in {"boards.greenhouse.io", "job-boards.greenhouse.io"}:
        if parsed.path.startswith("/embed/job_app"):
            params = parse_qs(parsed.query)
            company = (params.get("for") or [""])[0]
            job_id = (params.get("token") or [""])[0]
            return greenhouse(company, job_id) if company and job_id else None
        match = re.search(r"/([^/]+)/jobs/(\d+)", parsed.path)
        return greenhouse(match.group(1), match.group(2)) if match else None

    if host in {"jobs.lever.co", "jobs.eu.lever.co"}:
        if len(parts) < 2:
            return None
        company, job_id = parts[0], parts[1]
        return AtsRef(
            kind="lever",
            company=company,
            id=job_id,
            api_url=f"https://api.lever.co/v0/postings/{quote(company, safe='')}/{quote(job_id, safe='')}?mode=json",
        )

    if host == "jobs.ashbyhq.com":
        if len(parts) < 2:
            return None
        org, job_id = parts[0], parts[1]
        return AtsRef(
            kind="ashby",
            company=org,
            id=job_id,
            api_url=(
                "https://api.ashbyhq.com/posting-api/job-board/"
                f"{quote(org, safe='')}?includeCompensation=true"
            ),
        )

    if host in {"jobs.smartrecruiters.com", "careers.smartrecruiters.com"}:
        if len(parts) < 2:
            return None
        company, slug = parts[0], parts[1]
        job_id = slug.split("-", 1)[0]
        return AtsRef(
            kind="smartrecruiters",
            company=company,
            id=job_id,
            api_url=(
                "https://api.smartrecruiters.com/v1/companies/"
                f"{quote(company, safe='')}/postings/{quote(job_id, safe='')}"
            ),
        )
    return None


def _html_to_text(fragment: str) -> str:
    if not fragment:
        return ""
    text = BeautifulSoup(fragment, "html.parser").get_text("\n")
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _ats_mapper(kind: str, data: object, ref: AtsRef) -> dict[str, str] | None:
    if not isinstance(data, dict):
        return None
    if kind == "greenhouse":
        content = data.get("content") or ""
        location = data.get("location") or {}
        company = data.get("company") or {}
        return {
            "title": str(data.get("title") or ""),
            "company": str(company.get("name") or ref.company) if isinstance(company, dict) else ref.company,
            "location": str(location.get("name") or "") if isinstance(location, dict) else "",
            "text": "\n\n".join(
                part for part in (str(data.get("title") or ""), _html_to_text(html_module.unescape(str(content)))) if part
            ),
        }
    if kind == "lever":
        lists = data.get("lists") or []
        list_text = "\n\n".join(
            "\n".join(part for part in (str(item.get("text") or ""), _html_to_text(str(item.get("content") or ""))) if part)
            for item in lists
            if isinstance(item, dict)
        )
        categories = data.get("categories") or {}
        return {
            "title": str(data.get("text") or ""),
            "company": ref.company,
            "location": str(categories.get("location") or "") if isinstance(categories, dict) else "",
            "text": "\n\n".join(
                part
                for part in (
                    str(data.get("text") or ""),
                    str(data.get("descriptionPlain") or ""),
                    list_text,
                    _html_to_text(str(data.get("additional") or "")),
                )
                if part
            ),
        }
    if kind == "ashby":
        jobs = data.get("jobs") or []
        match = next(
            (job for job in jobs if isinstance(job, dict) and str(job.get("id", "")).lower() == ref.id.lower()),
            None,
        )
        if match is None:
            return None
        description = str(match.get("descriptionPlain") or "") or _html_to_text(str(match.get("descriptionHtml") or ""))
        return {
            "title": str(match.get("title") or ""),
            "company": ref.company,
            "location": str(match.get("location") or ""),
            "text": "\n\n".join(part for part in (str(match.get("title") or ""), description) if part),
        }
    if kind == "smartrecruiters":
        job_ad = data.get("jobAd") or {}
        sections = job_ad.get("sections") or {} if isinstance(job_ad, dict) else {}
        parts: list[str] = []
        if isinstance(sections, dict):
            for key in ("jobDescription", "qualifications", "additionalInformation"):
                section = sections.get(key)
                if isinstance(section, dict):
                    text_value = _html_to_text(str(section.get("text") or ""))
                    if text_value:
                        parts.append(text_value)
        location = data.get("location") or {}
        company = data.get("company") or {}
        return {
            "title": str(data.get("name") or ""),
            "company": str(company.get("name") or ref.company) if isinstance(company, dict) else ref.company,
            "location": (
                ", ".join(
                    str(location.get(key) or "") for key in ("city", "region", "country") if location.get(key)
                )
                if isinstance(location, dict)
                else ""
            ),
            "text": "\n\n".join(part for part in (str(data.get("name") or ""), *parts) if part),
        }
    return None


def _resolve_ats(ref: AtsRef) -> dict[str, str] | None:
    data = _fetch_json(ref.api_url)
    job = _ats_mapper(ref.kind, data, ref)
    if job and len(job.get("text", "")) >= 80:
        return job
    return None


def _element_text(element: object) -> str:
    text = element.get_text("\n")  # type: ignore[attr-defined]
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def clean_html(html: str) -> tuple[dict[str, str], bool]:
    soup = BeautifulSoup(html, "html.parser")
    ld_title = ld_company = ld_location = ""
    found_json_ld = False
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(tag.string or tag.get_text() or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        blocks = data if isinstance(data, list) else [data]
        for block in blocks:
            if not isinstance(block, dict):
                continue
            types = block.get("@type")
            types = types if isinstance(types, list) else [types]
            if "JobPosting" not in types:
                continue
            found_json_ld = True
            ld_title = str(block.get("title") or ld_title)
            organization = block.get("hiringOrganization")
            if isinstance(organization, dict) and organization.get("name"):
                ld_company = str(organization["name"])
            location = block.get("jobLocation")
            if isinstance(location, list) and location:
                location = location[0]
            if isinstance(location, dict):
                address = location.get("address")
                if isinstance(address, dict):
                    city = str(address.get("addressLocality") or "")
                    region = str(address.get("addressRegion") or "")
                    ld_location = ", ".join(part for part in (city, region) if part) or ld_location

    for bad in soup.select("script,style,noscript,svg,nav,footer,header,form"):
        bad.decompose()

    container = None
    for selector in (
        "[class*=job-description]", "[class*=jobDescription]", "[id*=job-description]",
        "[class*=description]", "article", "main",
    ):
        for element in soup.select(selector):
            if len(_element_text(element)) > 300:
                container = element
                break
        if container is not None:
            break
    target = container or soup.body or soup
    text_value = re.sub(r"\n{3,}", "\n\n", _element_text(target)).strip()

    title = ld_title
    if not title:
        heading = soup.find("h1")
        if heading:
            title = heading.get_text(" ", strip=True)
    if not title and soup.title and soup.title.string:
        title = soup.title.get_text().strip()
    company = ld_company
    if not company:
        meta = soup.select_one('meta[property="og:site_name"]')
        if meta:
            company = str(meta.get("content") or "")
    return {
        "text": text_value,
        "title": title.strip()[:200],
        "company": company.strip()[:200],
        "location": ld_location.strip()[:200],
    }, found_json_ld


def extract_job_from_url(raw_url: str) -> JobProfile:
    url = validate_public_url(raw_url)
    notes: list[str] = []
    platform = urlsplit(url).hostname or None

    ats = parse_ats_url(url)
    if ats is not None:
        try:
            resolved = _resolve_ats(ats)
        except JobFetchFailed:
            resolved = None
        if resolved:
            return structure_job(
                resolved["text"],
                url=url,
                method=ExtractionMethod.ATS_API,
                title=resolved.get("title", ""),
                company=resolved.get("company", ""),
                location=resolved.get("location", ""),
                platform=ats.platform,
                confidence=0.9,
                notes=["Imported through the posting's public ATS API."],
            )
        notes.append("The ATS API returned no matching posting; the public page was used instead.")

    body, final_url, content_type = fetch_text(url)
    lowered_type = content_type.lower()
    if "html" not in lowered_type and "xml" not in lowered_type:
        raise JobFetchFailed(
            "The URL did not return an HTML job posting. Paste the description text instead."
        )
    cleaned, has_json_ld = clean_html(body)
    if len(cleaned["text"]) < 100:
        raise JobFetchFailed(
            "The page did not contain enough readable job-description text (it may require JavaScript "
            "or login). Paste the description instead."
        )
    return structure_job(
        cleaned["text"],
        url=final_url,
        method=ExtractionMethod.JSON_LD if has_json_ld else ExtractionMethod.HTML,
        title=cleaned["title"],
        company=cleaned["company"],
        location=cleaned["location"],
        platform=urlsplit(final_url).hostname or platform,
        confidence=0.75,
        notes=notes,
    )
