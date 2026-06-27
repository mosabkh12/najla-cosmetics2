import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminServices, saveService, toggleService, deleteService } from "@/api/services/services";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { RecordDialog, type Field } from "@/components/admin/RecordDialog";
import { Reveal } from "@/components/ScrollReveal";

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
    queryFn: () => getAdminServices(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-services"] });

  const save = async (values: any) => {
    try {
      await saveService({ data: { id: dlg.row?.id, payload: values } });
      toast.success("Saved");
      setDlg({ open: false, row: null });
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggle = async (r: any) => {
    try {
      await toggleService({ data: { id: r.id, currentActive: r.is_active } });
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    try {
      await deleteService({ data: { id } });
      toast.success("Deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[26px] sm:text-[30px]">{L("שירותים", "الخدمات", "Services")}</h1>
          <button onClick={() => setDlg({ open: true, row: { is_active: true, duration_minutes: 60 } })} className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <Plus className="h-4 w-4" />{L("חדש", "جديد", "New")}
          </button>
        </div>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card overflow-hidden" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שם", "الاسم", "Name")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("קטגוריה", "الفئة", "Category")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("מחיר", "السعر", "Price")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("משך", "المدة", "Duration")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("פעיל", "نشط", "Active")}</th>
                  <th className="text-end p-3"></th>
                </tr>
              </thead>
              <tbody>
                {services.map((s: any) => (
                  <tr key={s.id} className="border-t border-border/20 hover:bg-surface/50 transition-colors">
                    <td className="p-3 font-medium">{lang === "ar" ? s.name_ar || s.name : s.name}</td>
                    <td className="p-3 text-muted-foreground">{s.category}</td>
                    <td className="p-3">₪{Number(s.price).toFixed(0)}</td>
                    <td className="p-3">{s.duration_minutes}m</td>
                    <td className="p-3">{s.is_active ? "✓" : "—"}</td>
                    <td className="p-3 text-end">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => toggle(s)} className="h-8 w-8 rounded-lg">{s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                        <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, row: s })} className="h-8 w-8 rounded-lg"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => del(s.id)} className="h-8 w-8 rounded-lg"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

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
