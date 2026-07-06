import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminServices,
  saveService,
  toggleService,
  deleteService,
} from "@/api/services/services";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/utils";
import type { ServiceRow, ServiceFormValues } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff, Search, Scissors, Clock } from "lucide-react";
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
  const [dlg, setDlg] = useState<{ open: boolean; row: ServiceFormValues | null }>({
    open: false,
    row: null,
  });
  const [search, setSearch] = useState("");

  const { data: services = [] } = useQuery({
    queryKey: ["admin-services"],
    queryFn: () => getAdminServices(),
  });

  const filtered = services.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (lang === "ar" ? s.name_ar || s.name : s.name) ?? "";
    return name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q);
  });

  // The public services queries (index.tsx and services.tsx both read
  // ["services","active"]) now carry a 120s staleTime, so without this an
  // admin edit could keep showing stale data on the public site for up to
  // that long.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-services"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const save = async (values: ServiceFormValues) => {
    try {
      await saveService({ data: { id: dlg.row?.id, payload: values } });
      toast.success("Saved");
      setDlg({ open: false, row: null });
      refresh();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggle = async (r: ServiceRow) => {
    const key = ["admin-services"];
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<ServiceRow[]>(key);
    qc.setQueryData<ServiceRow[]>(key, (old = []) =>
      old.map((s) => (s.id === r.id ? { ...s, is_active: !s.is_active } : s)),
    );
    try {
      await toggleService({ data: { id: r.id, currentActive: r.is_active } });
    } catch (e: unknown) {
      qc.setQueryData(key, prev);
      toast.error(getErrorMessage(e));
    } finally {
      refresh();
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    try {
      await deleteService({ data: { id } });
      toast.success("Deleted");
      refresh();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("שירותים", "الخدمات", "Services")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {L(
                `${services.length} שירותים`,
                `${services.length} خدمات`,
                `${services.length} services`,
              )}
            </p>
          </div>
          <button
            onClick={() => setDlg({ open: true, row: { is_active: true, duration_minutes: 60 } })}
            className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 w-fit"
          >
            <Plus className="h-4 w-4" />
            {L("שירות חדש", "خدمة جديدة", "New Service")}
          </button>
        </div>
      </Reveal>

      {/* Search */}
      <Reveal direction="up" delay={1}>
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L("חיפוש שירות...", "بحث عن خدمة...", "Search services...")}
            className="w-full sm:w-80 h-10 ps-10 pe-4 rounded-xl bg-card border border-border/20 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </Reveal>

      {/* Table */}
      <Reveal direction="up" delay={2}>
        <div
          className="rounded-2xl bg-card overflow-hidden border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface/60 border-b border-border/15">
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {L("שם", "الاسم", "Name")}
                  </th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">
                    {L("קטגוריה", "الفئة", "Category")}
                  </th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {L("מחיר", "السعر", "Price")}
                  </th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">
                    {L("משך", "المدة", "Duration")}
                  </th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">
                    {L("סטטוס", "الحالة", "Status")}
                  </th>
                  <th className="text-end p-3.5 w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-border/10 hover:bg-surface/30 transition-colors"
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        {s.image_url ? (
                          <img
                            src={s.image_url}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface grid place-items-center shrink-0">
                            <Scissors className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">
                          {lang === "ar" ? s.name_ar || s.name : s.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 text-muted-foreground hidden sm:table-cell">
                      {s.category && (
                        <span className="text-[11px] font-medium bg-surface px-2.5 py-1 rounded-lg">
                          {s.category}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-semibold">₪{Number(s.price).toFixed(0)}</td>
                    <td className="p-3.5 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {s.duration_minutes}
                        {L("ד'", "د", "m")}
                      </span>
                    </td>
                    <td className="p-3.5 hidden sm:table-cell">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${s.is_active ? "bg-sage-soft text-sage border-sage/20" : "bg-surface text-muted-foreground border-border/30"}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${s.is_active ? "bg-sage" : "bg-muted-foreground/50"}`}
                        />
                        {s.is_active
                          ? L("פעיל", "نشط", "Active")
                          : L("מושבת", "غير نشط", "Inactive")}
                      </span>
                    </td>
                    <td className="p-3.5 text-end">
                      <div className="inline-flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggle(s)}
                          className="h-8 w-8 rounded-lg hover:bg-surface"
                        >
                          {s.is_active ? (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDlg({ open: true, row: s })}
                          className="h-8 w-8 rounded-lg hover:bg-surface"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => del(s.id)}
                          className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Scissors className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">
                        {search
                          ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                          : L("אין שירותים עדיין", "لا خدمات بعد", "No services yet")}
                      </div>
                      <div className="text-[12px] text-muted-foreground/60 mt-1">
                        {search
                          ? L("נסה חיפוש אחר", "جرب بحثاً آخر", "Try a different search")
                          : L("הוסף שירות ראשון", "أضف الخدمة الأولى", "Add your first service")}
                      </div>
                    </td>
                  </tr>
                )}
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
          title={
            dlg.row?.id
              ? L("עריכת שירות", "تعديل خدمة", "Edit Service")
              : L("שירות חדש", "خدمة جديدة", "New Service")
          }
          fields={fields}
          initial={dlg.row ?? { is_active: true }}
          onSubmit={save}
        />
      )}
    </div>
  );
}
