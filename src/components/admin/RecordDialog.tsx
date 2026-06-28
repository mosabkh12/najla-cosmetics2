import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export type Field =
  | { name: string; label: string; type?: "text" | "number" | "url" | "textarea"; placeholder?: string; step?: string }
  | { name: string; label: string; type: "switch" };

export function RecordDialog<T extends Record<string, any>>({
  open, onOpenChange, title, fields, initial, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  fields: Field[];
  initial: T;
  onSubmit: (values: T) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<T>(initial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {fields.map((f) => (
            <div key={f.name} className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  rows={3}
                  className="rounded-xl border-border/30 text-[13px]"
                />
              ) : f.type === "switch" ? (
                <div className="flex items-center gap-3">
                  <Switch checked={!!values[f.name]} onCheckedChange={(v) => setValues({ ...values, [f.name]: v })} />
                  <span className={`text-[12px] font-medium ${values[f.name] ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {values[f.name] ? "Active" : "Inactive"}
                  </span>
                </div>
              ) : (
                <Input
                  type={f.type ?? "text"}
                  step={(f as any).step}
                  value={values[f.name] ?? ""}
                  placeholder={(f as any).placeholder}
                  onChange={(e) => setValues({ ...values, [f.name]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
                  className="h-10 rounded-xl border-border/30 text-[13px]"
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 pb-6 pt-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full px-6 border-border/40">
            Cancel
          </Button>
          <button
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
            disabled={submitting}
            onClick={() => onSubmit(values)}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
