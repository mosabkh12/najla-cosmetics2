import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type Field =
  | {
      name: string;
      label: string;
      type?: "text" | "number" | "url" | "textarea";
      placeholder?: string;
      step?: string;
    }
  | { name: string; label: string; type: "switch" }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      placeholder?: string;
      // Adds a trailing "type a new value" option to the list — for fields
      // like category, where the choices are open-ended (whatever's already
      // in use), not a fixed enum, so there must be a way to introduce one
      // that isn't in the list yet.
      allowCustom?: boolean;
      customLabel?: string;
    };

// The only value shapes any field type in this generic dialog ever
// produces or loads: text/url/textarea write strings, number fields write
// a number or "" (while the input is empty), switch fields write a
// boolean — plus `null`/`undefined` for a DB row's nullable columns or a
// not-yet-filled-in field on a new record.
export type FormValue = string | number | boolean | null | undefined;

// `values` (keyed by T, generic per-instance) and `f` (the field
// definition driving which branch renders) aren't statically linked, so
// TypeScript can't itself prove "this value is a string/number because
// f.type is text/number" the way the runtime branching guarantees — this
// makes that guarantee explicit for the text/number/url/textarea inputs,
// which never actually hold a boolean (that's only ever written by the
// switch branch, a distinct field type).
function textInputValue(v: FormValue): string | number {
  return typeof v === "boolean" ? "" : (v ?? "");
}

export function RecordDialog<T extends Record<string, FormValue>>({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  fields: Field[];
  initial: T;
  onSubmit: (values: T) => Promise<void> | void;
  submitting?: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<T>(initial);
  // Fields currently showing a free-text input instead of their select
  // list, because "type a new value" was chosen (see allowCustom above).
  const [customFields, setCustomFields] = useState<Set<string>>(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {fields.map((f) => (
            <div key={f.name} className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {f.label}
              </Label>
              {f.type === "select" ? (
                customFields.has(f.name) ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={textInputValue(values[f.name])}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      className="h-10 rounded-xl border-border/30 text-[13px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCustomFields((prev) => {
                          const next = new Set(prev);
                          next.delete(f.name);
                          return next;
                        });
                        setValues({ ...values, [f.name]: null });
                      }}
                      className="h-10 shrink-0 rounded-xl border-border/30 px-3 text-[12px]"
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={
                      typeof values[f.name] === "string" ? (values[f.name] as string) : "__none"
                    }
                    onValueChange={(v) => {
                      if (v === "__custom") {
                        setCustomFields((prev) => new Set(prev).add(f.name));
                        setValues({ ...values, [f.name]: "" });
                        return;
                      }
                      setValues({ ...values, [f.name]: v === "__none" ? null : v });
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-border/30 text-[13px]">
                      <SelectValue placeholder={f.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{f.placeholder ?? "—"}</SelectItem>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                      {f.allowCustom && (
                        <SelectItem value="__custom">{f.customLabel ?? "+"}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )
              ) : f.type === "textarea" ? (
                <Textarea
                  value={textInputValue(values[f.name])}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  rows={3}
                  className="rounded-xl border-border/30 text-[13px]"
                />
              ) : f.type === "switch" ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!values[f.name]}
                    onCheckedChange={(v) => setValues({ ...values, [f.name]: v })}
                  />
                  <span
                    className={`text-[12px] font-medium ${values[f.name] ? "text-sage" : "text-muted-foreground"}`}
                  >
                    {values[f.name] ? t("is_active") : t("is_inactive")}
                  </span>
                </div>
              ) : (
                <Input
                  type={f.type ?? "text"}
                  step={f.step}
                  value={textInputValue(values[f.name])}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.name]:
                        f.type === "number"
                          ? e.target.value === ""
                            ? ""
                            : Number(e.target.value)
                          : e.target.value,
                    })
                  }
                  className="h-10 rounded-xl border-border/30 text-[13px]"
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 pb-6 pt-0 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-6 border-border/40"
          >
            {t("cancel")}
          </Button>
          <button
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
            disabled={submitting}
            onClick={() => onSubmit(values)}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
