import { useEffect } from "react";

const LOCK_ATTR = "data-scroll-locked";

// Radix Select (and, before this session's fix, DropdownMenu) shares the
// same underlying scroll-lock mechanism as Dialog: whenever it opens, the
// react-remove-scroll-bar library sets `data-scroll-locked` on <body> and
// injects a `!important` stylesheet rule that hides the page scrollbar and
// reflows content to compensate. That's the right behavior for a real
// modal (Dialog) — the background genuinely shouldn't scroll while one is
// open — but for a plain dropdown it just makes the scrollbar flicker in
// and out on every open/close.
//
// Unlike Dialog/DropdownMenu, Radix Select exposes no `modal` prop to opt
// out of this — it's hardcoded with no supported toggle. This watches for
// the lock attribute being applied and, ONLY when no real dialog is
// actually open, immediately removes it. An inline `!important` override
// always beats an injected stylesheet's `!important` rule for the same
// property/selector, so clearing the attribute here reliably keeps the
// scrollbar visible for a lone Select without touching genuine
// Dialog/AlertDialog scroll-locking.
export function useKeepScrollbarVisibleForSelects() {
  useEffect(() => {
    const body = document.body;

    const hasOpenDialog = () =>
      !!document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );

    const reconcile = () => {
      if (body.hasAttribute(LOCK_ATTR) && !hasOpenDialog()) {
        body.removeAttribute(LOCK_ATTR);
      }
    };

    reconcile();
    const observer = new MutationObserver(reconcile);
    observer.observe(body, { attributes: true, attributeFilter: [LOCK_ATTR] });
    return () => observer.disconnect();
  }, []);
}
