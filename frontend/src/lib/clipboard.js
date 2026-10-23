export async function readClipboardText() {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav?.clipboard || typeof nav.clipboard.readText !== "function") {
    return { ok: false, reason: "unsupported" };
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { ok: false, reason: "insecure" };
  }
  try {
    const text = await nav.clipboard.readText();
    if (!text || !text.trim()) return { ok: false, reason: "empty" };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "denied" };
  }
}
