import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminProducts,
  saveProduct,
  toggleProduct,
  deleteProduct,
} from "@/api/products/products";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { getErrorMessage } from "@/lib/utils";
import type { ProductRow, ProductFormValues } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff, Search, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RecordDialog, type Field } from "@/components/admin/RecordDialog";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/products")({
  // See admin.index.tsx for why this loader exists and why it swallows errors.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["admin-products"],
        queryFn: () => getAdminProducts(),
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
  const [dlg, setDlg] = useState<{ open: boolean; row: ProductFormValues | null }>({
    open: false,
    row: null,
  });
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => getAdminProducts(),
  });

  // Categories are open-ended (whatever the admin has already typed in),
  // not a fixed enum — the select lists every distinct one in use, plus a
  // "+ New category" entry (see allowCustom) to introduce another.
  const categoryOptions = Array.from(new Set(products.map((p) => p.category).filter(Boolean)))
    .sort()
    .map((c) => ({ value: c, label: c }));

  const fields: Field[] = [
    { name: "name", label: L("שם (עברית)", "الاسم (بالعبرية)", "Name (Hebrew)") },
    { name: "name_ar", label: L("שם (ערבית)", "الاسم (بالعربية)", "Name (Arabic)") },
    { name: "name_en", label: L("שם (אנגלית)", "الاسم (بالإنجليزية)", "Name (English)") },
    {
      name: "description",
      label: L("תיאור (עברית)", "الوصف (بالعبرية)", "Description (Hebrew)"),
      type: "textarea",
    },
    {
      name: "description_ar",
      label: L("תיאור (ערבית)", "الوصف (بالعربية)", "Description (Arabic)"),
      type: "textarea",
    },
    {
      name: "description_en",
      label: L("תיאור (אנגלית)", "الوصف (بالإنجليزية)", "Description (English)"),
      type: "textarea",
    },
    {
      name: "category",
      label: L("קטגוריה", "الفئة", "Category"),
      type: "select",
      placeholder: L("בחר קטגוריה", "اختر فئة", "Select a category"),
      options: categoryOptions,
      allowCustom: true,
      customLabel: L("+ קטגוריה חדשה", "+ فئة جديدة", "+ New category"),
    },
    { name: "price", label: L("מחיר (₪)", "السعر (₪)", "Price (₪)"), type: "number", step: "0.01" },
    {
      name: "skin_type",
      label: t("skin_type"),
      type: "select",
      placeholder: L("לא צוין", "غير محدد", "Not specified"),
      options: [
        { value: "oily", label: t("skin_type_oily") },
        { value: "dry", label: t("skin_type_dry") },
        { value: "sensitive", label: t("skin_type_sensitive") },
        { value: "normal", label: t("skin_type_normal") },
      ],
    },
    {
      name: "stock_quantity",
      label: L("כמות במלאי", "كمية المخزون", "Stock Quantity"),
      type: "number",
    },
    {
      name: "low_stock_threshold",
      label: L("סף מלאי נמוך", "حد المخزون المنخفض", "Low-Stock Threshold"),
      type: "number",
    },
    {
      name: "image_url",
      label: L("קישור לתמונה ראשית", "رابط الصورة الرئيسية", "Main Image URL"),
      type: "url",
    },
    { name: "is_active", label: t("is_active"), type: "switch" },
  ];

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = pickLocalized(lang, p.name, p.name_ar, p.name_en);
    return name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
  });

  // The public product queries (products.index.tsx: ["products","all"],
  // index.tsx: ["products","featured"], products.$id.tsx: ["product", id])
  // now carry a 120s staleTime, so without this they could keep showing
  // stale data in the browser for up to that long after an admin edit.
  // Partial key matching means ["products"] and ["product"] each invalidate
  // every query keyed under them, including per-id detail queries.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product"] });
  };

  const save = async (values: ProductFormValues) => {
    try {
      await saveProduct({ data: { id: dlg.row?.id, payload: values } });
      toast.success(t("save"));
      setDlg({ open: false, row: null });
      refresh();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggle = async (r: ProductRow) => {
    const key = ["admin-products"];
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<ProductRow[]>(key);
    qc.setQueryData<ProductRow[]>(key, (old = []) =>
      old.map((p) => (p.id === r.id ? { ...p, is_active: !p.is_active } : p)),
    );
    try {
      await toggleProduct({ data: { id: r.id, currentActive: r.is_active } });
    } catch (e: unknown) {
      qc.setQueryData(key, prev);
      toast.error(getErrorMessage(e));
    } finally {
      refresh();
    }
  };

  const del = async (id: string) => {
    if (!confirm(L("למחוק את המוצר?", "هل تريد حذف هذا المنتج؟", "Delete this product?"))) return;
    try {
      await deleteProduct({ data: { id } });
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
              {L("מוצרים", "المنتجات", "Products")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {L(
                `${products.length} מוצרים`,
                `${products.length} منتجات`,
                `${products.length} products`,
              )}
            </p>
          </div>
          <button
            onClick={() =>
              setDlg({
                open: true,
                row: { is_active: true, stock_quantity: 0, low_stock_threshold: 5 },
              })
            }
            className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 w-fit"
          >
            <Plus className="h-4 w-4" />
            {L("מוצר חדש", "منتج جديد", "New Product")}
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
            placeholder={L("חיפוש מוצר...", "بحث عن منتج...", "Search products...")}
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
                {L("רשימת מוצרים", "قائمة المنتجات", "Products list")}
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
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell"
                  >
                    {L("קטגוריה", "الفئة", "Category")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("מחיר", "السعر", "Price")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("מלאי", "المخزون", "Stock")}
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
                    <td colSpan={6} className="py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40 mx-auto" />
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((p) => {
                    const low = p.stock_quantity <= (p.low_stock_threshold ?? 5);
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border/10 hover:bg-surface/30 transition-colors"
                      >
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt=""
                                className="h-9 w-9 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-lg bg-surface grid place-items-center shrink-0">
                                <Package className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            )}
                            <span className="font-medium text-foreground">
                              {pickLocalized(lang, p.name, p.name_ar, p.name_en)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 text-muted-foreground hidden sm:table-cell">
                          {p.category && (
                            <span className="text-[11px] font-medium bg-surface px-2.5 py-1 rounded-lg">
                              {p.category}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-semibold">₪{Number(p.price).toFixed(0)}</td>
                        <td className="p-3.5">
                          <span
                            className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg ${low ? "bg-destructive/10 text-destructive" : "bg-sage-soft text-sage"}`}
                          >
                            {p.stock_quantity}
                          </span>
                        </td>
                        <td className="p-3.5 hidden sm:table-cell">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${p.is_active ? "bg-sage-soft text-sage border-sage/20" : "bg-surface text-muted-foreground border-border/30"}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${p.is_active ? "bg-sage" : "bg-muted-foreground/50"}`}
                            />
                            {p.is_active ? t("is_active") : t("is_inactive")}
                          </span>
                        </td>
                        <td className="p-3.5 text-end">
                          <div className="inline-flex gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggle(p)}
                              aria-label={`${p.is_active ? t("is_inactive") : t("is_active")}: ${pickLocalized(lang, p.name, p.name_ar, p.name_en)}`}
                              className="h-8 w-8 rounded-lg hover:bg-surface"
                            >
                              {p.is_active ? (
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
                              onClick={() => setDlg({ open: true, row: p })}
                              aria-label={`${L("עריכה", "تعديل", "Edit")}: ${pickLocalized(lang, p.name, p.name_ar, p.name_en)}`}
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
                              onClick={() => del(p.id)}
                              aria-label={`${t("delete")}: ${pickLocalized(lang, p.name, p.name_ar, p.name_en)}`}
                              className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Package className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">
                        {search
                          ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                          : L("אין מוצרים עדיין", "لا منتجات بعد", "No products yet")}
                      </div>
                      <div className="text-[12px] text-muted-foreground/60 mt-1">
                        {search
                          ? L("נסה חיפוש אחר", "جرب بحثاً آخر", "Try a different search")
                          : L("הוסף מוצר ראשון", "أضف المنتج الأول", "Add your first product")}
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
              ? L("עריכת מוצר", "تعديل منتج", "Edit Product")
              : L("מוצר חדש", "منتج جديد", "New Product")
          }
          fields={fields}
          initial={dlg.row ?? { is_active: true, stock_quantity: 0, low_stock_threshold: 5 }}
          onSubmit={save}
        />
      )}
    </div>
  );
}
