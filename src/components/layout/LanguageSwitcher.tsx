import { Languages } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const labels: Record<Lang, string> = { he: "עברית", ar: "العربية", en: "English" };

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-secondary-foreground">
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">{labels[lang]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {(["he", "ar", "en"] as Lang[]).map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLang(l)} className={lang === l ? "font-semibold text-primary" : ""}>
            {labels[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
