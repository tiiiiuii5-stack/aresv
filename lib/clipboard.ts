export type ClipboardCopyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function copyToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (!text.trim()) {
    return { ok: false, error: "Nothing is available to copy." };
  }

  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  const secureContext = typeof window === "undefined" || window.isSecureContext;

  if (clipboard?.writeText && secureContext) {
    try {
      await clipboard.writeText(text);
      return { ok: true };
    } catch (error) {
      const fallbackResult = copyWithTextareaFallback(text);
      if (fallbackResult.ok) return fallbackResult;
      return { ok: false, error: clipboardErrorMessage(error) };
    }
  }

  return copyWithTextareaFallback(text);
}

function copyWithTextareaFallback(text: string): ClipboardCopyResult {
  if (typeof document === "undefined" || !document.body) {
    return { ok: false, error: "Clipboard access is unavailable in this environment." };
  }

  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  try {
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const copied = document.execCommand("copy");
    return copied
      ? { ok: true }
      : { ok: false, error: "Clipboard copy was blocked by the browser." };
  } catch (error) {
    return { ok: false, error: clipboardErrorMessage(error) };
  } finally {
    textarea.remove();
    previousActiveElement?.focus();
  }
}

function clipboardErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Clipboard permission was denied.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Clipboard copy failed.";
}
