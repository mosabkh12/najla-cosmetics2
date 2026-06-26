import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  // reset when re-opened
  if (open && values !== initial && (values as any).__k !== (initial as any).__k) {
    // no-op; we rely on key-based remount from caller
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3 mt-2">
          {fields.map((f) => (
            <div key={f.name} className="grid gap-1.5">
              <Label className="text-xs">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} rows={3} />
              ) : f.type === "switch" ? (
                <Switch checked={!!values[f.name]} onCheckedChange={(v) => setValues({ ...values, [f.name]: v })} />
              ) : (
                <Input
                  type={f.type ?? "text"}
                  step={(f as any).step}
                  value={values[f.name] ?? ""}
                  placeholder={(f as any).placeholder}
                  onChange={(e) => setValues({ ...values, [f.name]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="btn-gold" disabled={submitting} onClick={() => onSubmit(values)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
