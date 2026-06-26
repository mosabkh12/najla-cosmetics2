import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { RecordDialog, type Field } from "@/components/admin/RecordDialog";

export const Route = createFileRoute("/admin/services")({ component: Page });

const fields: Field[] = [
  { name: "name", label: "Name (HE)" },
  { name: "name_ar", label: "Name (AR)" },
  { name: "description", label: "Description (HE)", type: "textarea" },
  { name: "description_ar", label: "Description (AR)", type: "textarea" },
  { name: "category", label: "Category" },
  { name: "price", label: "Price (₪)", type: "number", step: "0.01" },
  { name: "duration_minutes", label: "Duration (min)", type: "number" },
  { name: "image_url", label: "Image URL", type: "url" },
  { name: "is_active", label: "Active", type: "switch" },
];

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [dlg, setDlg] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });

  const { data: services = [] } = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-services"] });

  const save = async (values: any) => {
    const payload = { ...values, price: Number(values.price) || 0, duration_minutes: Number(values.duration_minutes) || 30, is_active: !!values.is_active };
    const op = dlg.row?.id
      ? await supabase.from("services").update(payload).eq("id", dlg.row.id)
      : await supabase.from("services").insert(payload);
    if (op.error) return toast.error(op.error.message);
    toast.success("Saved");
    setDlg({ open: false, row: null });
    refresh();
  };

  const toggle = async (r: any) => {
    const { error } = await supabase.from("services").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message); else refresh();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{L("שירותים", "الخدمات", "Services")}</h1>
        <Button className="btn-gold" onClick={() => setDlg({ open: true, row: { is_active: true, duration_minutes: 60 } })}>
          <Plus className="h-4 w-4 me-1" />{L("חדש", "جديد", "New")}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card soft-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-secondary-foreground">
              <tr>
                <th className="text-start p-3">{L("שם", "الاسم", "Name")}</th>
                <th className="text-start p-3">{L("קטגוריה", "الفئة", "Category")}</th>
                <th className="text-start p-3">{L("מחיר", "السعر", "Price")}</th>
                <th className="text-start p-3">{L("משך", "المدة", "Duration")}</th>
                <th className="text-start p-3">{L("פעיל", "نشط", "Active")}</th>
                <th className="text-end p-3"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s: any) => (
                <tr key={s.id} className="border-t border-border/40">
                  <td className="p-3 font-medium">{lang === "ar" ? s.name_ar || s.name : s.name}</td>
                  <td className="p-3 text-secondary-foreground">{s.category}</td>
                  <td className="p-3">₪{Number(s.price).toFixed(0)}</td>
                  <td className="p-3">{s.duration_minutes}m</td>
                  <td className="p-3">{s.is_active ? "✓" : "—"}</td>
                  <td className="p-3 text-end">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => toggle(s)}>{s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                      <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, row: s })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dlg.open && (
        <RecordDialog
          key={dlg.row?.id ?? "new"}
          open={dlg.open}
          onOpenChange={(v) => setDlg({ open: v, row: v ? dlg.row : null })}
          title={dlg.row?.id ? L("עריכת שירות", "تعديل خدمة", "Edit Service") : L("שירות חדש", "خدمة جديدة", "New Service")}
          fields={fields}
          initial={dlg.row ?? { is_active: true }}
          onSubmit={save}
        />
      )}
    </div>
  );
}
