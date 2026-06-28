import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminOrders, getOrderItems, updateOrderStatus } from "@/api/orders/orders";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";
import { ShoppingCart, Search, Package, Eye } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({ component: Page });

const STATUSES = ["pending", "confirmed", "preparing", "completed", "cancelled"] as const;

const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};
const statusDot: Record<string, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-blue-500",
  preparing: "bg-purple-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
};

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [view, setView] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => getAdminOrders(),
  });

  const filtered = orders.filter((o: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      String(o.order_number).includes(q) ||
      (o.customer_phone ?? "").includes(q)
    );
  });

  const { data: items = [] } = useQuery({
    queryKey: ["admin-order-items", view],
    enabled: !!view,
    queryFn: () => getOrderItems({ data: { orderId: view! } }),
  });

  const setStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus({ data: { id, status } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const viewOrder = orders.find((o: any) => o.id === view);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">{L("הזמנות", "الطلبات", "Orders")}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{L(`${orders.length} הזמנות`, `${orders.length} طلبات`, `${orders.length} orders`)}</p>
          </div>
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
            placeholder={L("חיפוש הזמנה...", "بحث عن طلب...", "Search orders...")}
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
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">#</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">{L("תאריך", "التاريخ", "Date")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("לקוחה", "العميلة", "Customer")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell">{L("טלפון", "الهاتف", "Phone")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("סך הכל", "المجموع", "Total")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("סטטוס", "الحالة", "Status")}</th>
                  <th className="text-end p-3.5 w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o: any) => (
                  <tr key={o.id} className="border-t border-border/10 hover:bg-surface/30 transition-colors">
                    <td className="p-3.5">
                      <span className="text-[12px] font-mono font-semibold text-primary bg-cream px-2 py-0.5 rounded">{o.order_number}</span>
                    </td>
                    <td className="p-3.5 text-muted-foreground text-[12px] hidden sm:table-cell">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground shrink-0">
                          {(o.customer_name ?? "?")[0]}
                        </div>
                        <span className="font-medium text-foreground">{o.customer_name}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-muted-foreground text-[12px] hidden md:table-cell" dir="ltr">{o.customer_phone}</td>
                    <td className="p-3.5 font-semibold">₪{Number(o.total).toFixed(0)}</td>
                    <td className="p-3.5">
                      <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                        <SelectTrigger className={`h-8 w-[130px] rounded-full border text-[11px] font-medium gap-1.5 ${statusColor[o.status] ?? "bg-surface text-muted-foreground border-border/30"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[o.status] ?? "bg-muted-foreground"}`} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <span className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full ${statusDot[s]}`} />
                                {s}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3.5 text-end">
                      <Button size="icon" variant="ghost" onClick={() => setView(o.id)} className="h-8 w-8 rounded-lg hover:bg-surface">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <ShoppingCart className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">{search ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found") : L("אין הזמנות עדיין", "لا طلبات بعد", "No orders yet")}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {/* Order items dialog */}
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {L("פריטי הזמנה", "عناصر الطلب", "Order Items")}
              {viewOrder && (
                <span className="text-[12px] font-mono font-normal text-primary bg-cream px-2 py-0.5 rounded">#{viewOrder.order_number}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-0">
            {items.map((it: any) => (
              <div key={it.id} className="flex items-center justify-between py-3 border-b border-border/10 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface shrink-0">
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-foreground">{it.product_name}</div>
                    <div className="text-[11px] text-muted-foreground">{L("כמות", "الكمية", "Qty")}: {it.quantity}</div>
                  </div>
                </div>
                <span className="text-[14px] font-semibold text-foreground">₪{Number(it.total_price).toFixed(0)}</span>
              </div>
            ))}
            {items.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <Package className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <div className="text-[13px] text-muted-foreground">{L("אין פריטים", "لا عناصر", "No items")}</div>
              </div>
            )}
          </div>
          {items.length > 0 && viewOrder && (
            <div className="flex items-center justify-between pt-3 border-t border-border/20 mt-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("סך הכל", "المجموع", "Total")}</span>
              <span className="text-[18px] font-display font-semibold text-foreground">₪{Number(viewOrder.total).toFixed(0)}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
