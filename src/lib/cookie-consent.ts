// Single source of truth for the site's cookie / local-storage consent
// choice, shared between CookieConsentBanner.tsx (which reads/writes it)
// and every "Cookie Settings" entry point (Footer, the privacy page) that
// needs to reopen the banner later to change a choice already made. A
// plain window event is enough for this one-off, rarely-used interaction —
// not worth a dedicated React context provider just to prop-drill one
// reopen trigger.
export const COOKIE_CONSENT_KEY = "najla:cookie-consent";
export type CookieConsent = "all" | "necessary";

const REOPEN_EVENT = "najla:reopen-cookie-banner";

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(COOKIE_CONSENT_KEY);
  return value === "all" || value === "necessary" ? value : null;
}

export function setCookieConsent(consent: CookieConsent): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, consent);
}

export function reopenCookieBanner(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

// Returns an unsubscribe function, matching the shape a useEffect cleanup
// expects.
export function onReopenCookieBanner(handler: () => void): () => void {
  window.addEventListener(REOPEN_EVENT, handler);
  return () => window.removeEventListener(REOPEN_EVENT, handler);
}
