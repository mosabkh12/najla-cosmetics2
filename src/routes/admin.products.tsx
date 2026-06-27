import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { RecordDialog, type Field } from "@/components/admin/RecordDialog";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/products")({ component: Page });

const fields: Field[] = [
  { name: "name", label: "Name (HE)" },
  { name: "name_ar", label: "Name (AR)" },
  { name: "description", label: "Description (HE)", type: "textarea" },
  { name: "description_ar", label: "Description (AR)", type: "textarea" },
  { name: "category", label: "Category" },
  { name: "price", label: "Price (₪)", type: "number", step: "0.01" },
  { name: "stock_quantity", label: "Stock Quantity", type: "number" },
  { name: "low_stock_threshold", label: "Low-Stock Threshold", type: "number" },
  { name: "image_url", label: "Main Image URL", type: "url" },
  { name: "is_active", label: "Active", type: "switch" },
];

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [dlg, setDlg] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-products"] });

  const save = async (values: any) => {
    const payload = {
      ...values,
      price: Number(values.price) || 0,
      stock_quantity: Number(values.stock_quantity) || 0,
      low_stock_threshold: Number(values.low_stock_threshold) || 5,
      is_active: !!values.is_active,
    };
    const op = dlg.row?.id
      ? await supabase.from("products").update(payload).eq("id", dlg.row.id)
      : await supabase.from("products").insert(payload);
    if (op.error) { toast.error(op.error.message); return; }
    toast.success("Saved");
    setDlg({ open: false, row: null });
    refresh();
  };

  const toggle = async (r: any) => {
    const { error } = await supabase.from("products").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message); else refresh();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[26px] sm:text-[30px]">{L("מוצרים", "المنتجات", "Products")}</h1>
          <button onClick={() => setDlg({ open: true, row: { is_active: true, stock_quantity: 0, low_stock_threshold: 5 } })} className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <Plus className="h-4 w-4" />{L("חדש", "جديد", "New")}
          </button>
        </div>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card overflow-hidden"
          style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שם", "الاسم", "Name")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("קטגוריה", "الفئة", "Category")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("מחיר", "السعر", "Price")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("מלאי", "المخزون", "Stock")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("פעיל", "نشط", "Active")}</th>
                  <th className="text-end p-3"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p: any) => {
                  const low = p.stock_quantity <= (p.low_stock_threshold ?? 5);
                  return (
                    <tr key={p.id} className="border-t border-border/20 hover:bg-surface/50 transition-colors">
                      <td className="p-3 font-medium">{lang === "ar" ? p.name_ar || p.name : p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.category}</td>
                      <td className="p-3">₪{Number(p.price).toFixed(0)}</td>
                      <td className={`p-3 ${low ? "text-destructive font-medium" : ""}`}>{p.stock_quantity}</td>
                      <td className="p-3">{p.is_active ? "✓" : "—"}</td>
                      <td className="p-3 text-end">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => toggle(p)} className="h-8 w-8 rounded-lg">{p.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                          <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, row: p })} className="h-8 w-8 rounded-lg"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => del(p.id)} className="h-8 w-8 rounded-lg"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          title={dlg.row?.id ? L("עריכת מוצר", "تعديل منتج", "Edit Product") : L("מוצר חדש", "منتج جديد", "New Product")}
          fields={fields}
          initial={dlg.row ?? { is_active: true, stock_quantity: 0, low_stock_threshold: 5 }}
          onSubmit={save}
        />
      )}
    </div>
  );
}
