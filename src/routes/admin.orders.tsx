import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/orders")({ component: Page });

const STATUSES = ["pending", "confirmed", "preparing", "completed", "cancelled"] as const;

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [view, setView] = useState<string | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["admin-order-items", view],
    enabled: !!view,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", view!);
      if (error) throw error;
      return data;
    },
  });

  const setStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }
  };

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <h1 className="font-display text-[26px] sm:text-[30px]">{L("הזמנות", "الطلبات", "Orders")}</h1>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card overflow-hidden" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">#</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("תאריך", "التاريخ", "Date")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("לקוחה", "العميلة", "Customer")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("טלפון", "الهاتف", "Phone")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("סך הכל", "المجموع", "Total")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("סטטוס", "الحالة", "Status")}</th>
                  <th className="text-end p-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-t border-border/20 hover:bg-surface/50 transition-colors">
                    <td className="p-3 font-medium">{o.order_number}</td>
                    <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="p-3">{o.customer_name}</td>
                    <td className="p-3 text-muted-foreground">{o.customer_phone}</td>
                    <td className="p-3">₪{Number(o.total).toFixed(0)}</td>
                    <td className="p-3">
                      <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                        <SelectTrigger className="h-8 w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-end"><Button size="sm" variant="ghost" onClick={() => setView(o.id)} className="rounded-lg">{L("פריטים", "العناصر", "Items")}</Button></td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">{L("פריטי הזמנה", "عناصر الطلب", "Order Items")}</DialogTitle></DialogHeader>
          <div className="divide-y divide-border/20 mt-2">
            {items.map((it: any) => (
              <div key={it.id} className="flex justify-between py-2 text-sm">
                <span>{it.product_name} × {it.quantity}</span>
                <span>₪{Number(it.total_price).toFixed(0)}</span>
              </div>
            ))}
            {items.length === 0 && <div className="text-sm text-muted-foreground py-2">—</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
