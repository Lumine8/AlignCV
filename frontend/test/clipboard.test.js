import { afterEach, describe, expect, it, vi } from "vitest";
import { readClipboardText } from "../src/lib/clipboard.js";

function stubClipboard(readText) {
  vi.stubGlobal("navigator", { clipboard: { readText } });
  vi.stubGlobal("window", { isSecureContext: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readClipboardText", () => {
  it("returns the text when the clipboard is readable", async () => {
    stubClipboard(vi.fn().mockResolvedValue("Senior Data Analyst\nRequirements: SQL, Python"));
    await expect(readClipboardText()).resolves.toEqual({
      ok: true,
      text: "Senior Data Analyst\nRequirements: SQL, Python",
    });
  });

  it("reports unsupported when the Clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: true });
    await expect(readClipboardText()).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("reports insecure on a non-secure context", async () => {
    stubClipboard(vi.fn());
    vi.stubGlobal("window", { isSecureContext: false });
    await expect(readClipboardText()).resolves.toEqual({ ok: false, reason: "insecure" });
  });

  it("reports empty for whitespace-only clipboard contents", async () => {
    stubClipboard(vi.fn().mockResolvedValue("   \n  "));
    await expect(readClipboardText()).resolves.toEqual({ ok: false, reason: "empty" });
  });

  it("reports denied when readText rejects", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    await expect(readClipboardText()).resolves.toEqual({ ok: false, reason: "denied" });
  });
});
