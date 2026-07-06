import type { Lang } from "@/lib/i18n";

// Pure helper, not tied to the i18n context — lives in its own module (not
// i18n.tsx) so that file can export only components/hooks, keeping React
// Fast Refresh working cleanly there.
export function pickLocalized(
  lang: Lang,
  base: string | null | undefined,
  ar: string | null | undefined,
  en?: string | null,
): string {
  if (lang === "ar" && ar) return ar;
  if (lang === "en" && en) return en;
  return base ?? "";
}
