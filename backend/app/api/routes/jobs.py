from fastapi import APIRouter

from ...schemas.job import JobExtractionResult, JobExtractRequest
from ...services.jobs.extract import extract_job_from_text
from ...services.jobs.fetch import extract_job_from_url

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/extract", response_model=JobExtractionResult)
def extract_job(payload: JobExtractRequest) -> JobExtractionResult:
    if payload.url and payload.url.strip():
        job = extract_job_from_url(payload.url.strip())
    else:
        job = extract_job_from_text(payload.text or "", payload.title, payload.company)
    return JobExtractionResult(status="ok", job=job)
