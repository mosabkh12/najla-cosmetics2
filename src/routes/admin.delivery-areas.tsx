import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminDeliveryAreas,
  saveDeliveryArea,
  toggleDeliveryArea,
  deleteDeliveryArea,
} from "@/api/delivery-areas/delivery-areas";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { getErrorMessage } from "@/lib/utils";
import type { DeliveryAreaRow, DeliveryAreaFormValues } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff, Search, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RecordDialog, type Field } from "@/components/admin/RecordDialog";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/delivery-areas")({
  // See admin.index.tsx for why this loader exists and why it swallows errors.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["admin-delivery-areas"],
        queryFn: () => getAdminDeliveryAreas(),
      });
    } catch {
      // handled by AdminLayout's redirect
    }
  },
  pendingComponent: () => (
    <div className="min-h-[40vh] grid place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
  component: Page,
});

function Page() {
  const { lang, t } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [dlg, setDlg] = useState<{ open: boolean; row: DeliveryAreaFormValues | null }>({
    open: false,
    row: null,
  });
  const [search, setSearch] = useState("");

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ["admin-delivery-areas"],
    queryFn: () => getAdminDeliveryAreas(),
  });

  const fields: Field[] = [
    { name: "name", label: L("שם (עברית)", "الاسم (بالعبرية)", "Name (Hebrew)") },
    { name: "name_ar", label: L("שם (ערבית)", "الاسم (بالعربية)", "Name (Arabic)") },
    { name: "name_en", label: L("שם (אנגלית)", "الاسم (بالإنجليزية)", "Name (English)") },
    {
      name: "price",
      label: L("דמי משלוח (₪)", "رسوم التوصيل (₪)", "Delivery fee (₪)"),
      type: "number",
      step: "0.01",
    },
    { name: "is_active", label: t("is_active"), type: "switch" },
  ];

  const filtered = areas
    .filter((a) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const name = pickLocalized(lang, a.name, a.name_ar, a.name_en);
      return name.toLowerCase().includes(q);
    })
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));

  // The public delivery-areas query (checkout.tsx reads ["delivery-areas"])
  // carries a 60s staleTime via its Cache-Control header — see
  // admin.services.tsx for why this invalidation on every admin edit matters.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  };

  const save = async (values: DeliveryAreaFormValues) => {
    try {
      await saveDeliveryArea({ data: { id: dlg.row?.id, payload: values } });
      toast.success(t("save"));
      setDlg({ open: false, row: null });
      refresh();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggle = async (r: DeliveryAreaRow) => {
    const key = ["admin-delivery-areas"];
    const prev = qc.getQueryData<DeliveryAreaRow[]>(key);
    qc.setQueryData<DeliveryAreaRow[]>(key, (old = []) =>
      old.map((a) => (a.id === r.id ? { ...a, is_active: !a.is_active } : a)),
    );
    qc.cancelQueries({ queryKey: key });
    try {
      await toggleDeliveryArea({ data: { id: r.id, currentActive: r.is_active } });
    } catch (e: unknown) {
      qc.setQueryData(key, prev);
      toast.error(getErrorMessage(e));
    } finally {
      refresh();
    }
  };

  const del = async (id: string) => {
    if (
      !confirm(
        L("למחוק את אזור המשלוח?", "هل تريد حذف منطقة التوصيل؟", "Delete this delivery area?"),
      )
    )
      return;
    try {
      await deleteDeliveryArea({ data: { id } });
      toast.success(L("נמחק", "تم الحذف", "Deleted"));
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
              {L("אזורי משלוח", "مناطق التوصيل", "Delivery Areas")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {L(`${areas.length} אזורים`, `${areas.length} مناطق`, `${areas.length} areas`)}
            </p>
          </div>
          <button
            onClick={() => setDlg({ open: true, row: { is_active: true } })}
            className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 w-fit"
          >
            <Plus className="h-4 w-4" />
            {L("אזור חדש", "منطقة جديدة", "New Area")}
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
            placeholder={L("חיפוש אזור...", "بحث عن منطقة...", "Search areas...")}
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
              <caption className="sr-only">
                {L("רשימת אזורי משלוח", "قائمة مناطق التوصيل", "Delivery areas list")}
              </caption>
              <thead>
                <tr className="bg-surface/60 border-b border-border/15">
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("שם", "الاسم", "Name")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("דמי משלוח", "رسوم التوصيل", "Delivery fee")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell"
                  >
                    {L("סטטוס", "الحالة", "Status")}
                  </th>
                  <th scope="col" className="text-end p-3.5 w-[120px]">
                    <span className="sr-only">{L("פעולות", "الإجراءات", "Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40 mx-auto" />
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-border/10 hover:bg-surface/30 transition-colors"
                    >
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-surface grid place-items-center shrink-0">
                            <Truck className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                          <span className="font-medium text-foreground">
                            {pickLocalized(lang, a.name, a.name_ar, a.name_en)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 font-semibold">₪{Number(a.price).toFixed(0)}</td>
                      <td className="p-3.5 hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${a.is_active ? "bg-sage-soft text-sage border-sage/20" : "bg-surface text-muted-foreground border-border/30"}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${a.is_active ? "bg-sage" : "bg-muted-foreground/50"}`}
                            aria-hidden="true"
                          />
                          {a.is_active ? t("is_active") : t("is_inactive")}
                        </span>
                      </td>
                      <td className="p-3.5 text-end">
                        <div className="inline-flex gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggle(a)}
                            aria-label={`${a.is_active ? t("is_inactive") : t("is_active")}: ${pickLocalized(lang, a.name, a.name_ar, a.name_en)}`}
                            className="h-8 w-8 rounded-lg hover:bg-surface"
                          >
                            {a.is_active ? (
                              <EyeOff
                                className="h-3.5 w-3.5 text-muted-foreground"
                                aria-hidden="true"
                              />
                            ) : (
                              <Eye
                                className="h-3.5 w-3.5 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDlg({ open: true, row: a })}
                            aria-label={`${L("עריכה", "تعديل", "Edit")}: ${pickLocalized(lang, a.name, a.name_ar, a.name_en)}`}
                            className="h-8 w-8 rounded-lg hover:bg-surface"
                          >
                            <Pencil
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => del(a.id)}
                            aria-label={`${t("delete")}: ${pickLocalized(lang, a.name, a.name_ar, a.name_en)}`}
                            className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <Truck className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">
                        {search
                          ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                          : L(
                              "אין אזורי משלוח עדיין",
                              "لا مناطق توصيل بعد",
                              "No delivery areas yet",
                            )}
                      </div>
                      <div className="text-[12px] text-muted-foreground/60 mt-1">
                        {search
                          ? L("נסה חיפוש אחר", "جرب بحثاً آخر", "Try a different search")
                          : L("הוסף אזור ראשון", "أضف منطقة أولى", "Add your first area")}
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
              ? L("עריכת אזור משלוח", "تعديل منطقة توصيل", "Edit Delivery Area")
              : L("אזור משלוח חדש", "منطقة توصيل جديدة", "New Delivery Area")
          }
          fields={fields}
          initial={dlg.row ?? { is_active: true }}
          onSubmit={save}
        />
      )}
    </div>
  );
}
