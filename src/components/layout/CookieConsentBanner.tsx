import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// Recorded so that if a non-essential cookie/tracker (analytics, ads) is
// ever added later, that code has something to check before loading —
// "necessary" must stay functionally equivalent to "all" until that day,
// since today there is nothing non-essential to withhold. Do not read this
// value to gate anything that doesn't exist yet; wire it up when it does.
const CONSENT_KEY = "najla:cookie-consent";
type Consent = "all" | "necessary";

// Deliberately starts hidden on both the server and the client's first
// render (before this effect runs) — matching state means nothing here can
// ever cause a hydration mismatch. It only becomes visible once this effect
// checks localStorage after mount, which is the earliest point a client-only
// value like this can safely be read.
export function CookieConsentBanner() {
  const { t, dir } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(CONSENT_KEY) == null) setVisible(true);
  }, []);

  if (!visible) return null;

  const choose = (consent: Consent) => {
    localStorage.setItem(CONSENT_KEY, consent);
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label={t("privacy_policy")}
      dir={dir}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/20 bg-card/95 backdrop-blur-md"
      style={{ boxShadow: "0 -8px 30px -12px rgba(45, 45, 45, 0.15)" }}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-4 px-5 py-5 sm:flex-row sm:gap-6 sm:px-10 md:px-20">
        <Cookie
          className="hidden h-6 w-6 shrink-0 text-primary sm:block"
          aria-hidden="true"
        />
        <p className="flex-1 text-center text-[13px] leading-relaxed text-secondary-foreground sm:text-start">
          {t("cookie_notice_text")}{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            {t("privacy_policy")}
          </Link>
        </p>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => choose("necessary")}
            className="w-full rounded-full border border-foreground px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background sm:w-auto"
          >
            {t("cookie_necessary_only")}
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="w-full rounded-full bg-foreground px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 sm:w-auto"
          >
            {t("cookie_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
