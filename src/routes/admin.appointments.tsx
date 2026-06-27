import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/appointments")({ component: Page });

const STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, service:services(name,name_ar)")
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("appointments").update({ status: status as any }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-appointments"] }); }
  };

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <h1 className="font-display text-[26px] sm:text-[30px]">{L("תורים", "المواعيد", "Appointments")}</h1>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card overflow-hidden" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("תאריך", "التاريخ", "Date")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שעה", "الوقت", "Time")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("לקוחה", "العميلة", "Customer")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("טלפון", "الهاتف", "Phone")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שירות", "الخدمة", "Service")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("מחיר", "السعر", "Price")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("סטטוס", "الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id} className="border-t border-border/20 align-top hover:bg-surface/50 transition-colors">
                    <td className="p-3">{a.appointment_date}</td>
                    <td className="p-3">{a.appointment_time?.slice(0, 5)}</td>
                    <td className="p-3 font-medium">{a.customer_name}</td>
                    <td className="p-3 text-muted-foreground">{a.customer_phone}</td>
                    <td className="p-3">{lang === "ar" ? a.service?.name_ar || a.service?.name : a.service?.name}</td>
                    <td className="p-3">₪{Number(a.total_price).toFixed(0)}</td>
                    <td className="p-3">
                      <Select value={a.status} onValueChange={(v) => setStatus(a.id, v)}>
                        <SelectTrigger className="h-8 w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
