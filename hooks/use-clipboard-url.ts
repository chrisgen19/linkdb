"use client";

import * as React from "react";

import { findUrlInText } from "@/lib/url";

function canReadClipboard(): boolean {
  // navigator.clipboard is undefined outside secure contexts (plain-http LAN dev).
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
}

/**
 * Whether the clipboard can be read without a prompt. Only Chromium supports
 * the `clipboard-read` permission; Safari and Firefox reject the query, and
 * always need a tap plus their own "Paste" callout.
 */
async function hasSilentClipboardAccess(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({
      name: "clipboard-read" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Clipboard helpers for the add-link URL field.
 * - `supported`: a Paste button can work in this browser.
 * - `detectedUrl`: a link already on the clipboard, found without prompting
 *   (Chromium, once the user has allowed clipboard access), else null.
 * - `readText`: reads the clipboard; call it from a tap. Throws if blocked.
 */
export function useClipboardUrl(enabled: boolean) {
  const [supported, setSupported] = React.useState(false);
  const [detectedUrl, setDetectedUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSupported(canReadClipboard());
  }, []);

  React.useEffect(() => {
    if (!enabled || !canReadClipboard()) return;
    let cancelled = false;

    async function peek() {
      if (!(await hasSilentClipboardAccess())) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!cancelled) setDetectedUrl(findUrlInText(text));
      } catch {
        // Chromium rejects reads while the page isn't focused; the next focus retries.
      }
    }

    // Re-check when the user comes back after copying a link in another app.
    const onVisible = () => {
      if (document.visibilityState === "visible") void peek();
    };
    void peek();
    window.addEventListener("focus", peek);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", peek);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  const readText = React.useCallback(() => navigator.clipboard.readText(), []);

  return { supported, detectedUrl, readText };
}
