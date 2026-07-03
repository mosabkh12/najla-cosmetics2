import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminAppointments, updateAppointmentStatus } from "@/api/appointments/appointments";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";
import { CalendarDays, Search, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/appointments")({ component: Page });

const STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;

const statusColor: Record<string, string> = {
  pending: "bg-gold-deep/10 text-gold-deep border-gold-deep/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-sage-soft text-sage border-sage/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};
const statusDot: Record<string, string> = {
  pending: "bg-gold-deep",
  confirmed: "bg-primary",
  completed: "bg-sage",
  cancelled: "bg-destructive",
};

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [search, setSearch] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: () => getAdminAppointments(),
  });

  const filtered = rows.filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (a.customer_name ?? "").toLowerCase().includes(q) ||
      (a.customer_phone ?? "").includes(q) ||
      (a.appointment_date ?? "").includes(q)
    );
  });

  const setStatus = async (id: string, status: string) => {
    try {
      await updateAppointmentStatus({ data: { id, status } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">{L("תורים", "المواعيد", "Appointments")}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{L(`${rows.length} תורים`, `${rows.length} مواعيد`, `${rows.length} appointments`)}</p>
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
            placeholder={L("חיפוש תור...", "بحث عن موعد...", "Search appointments...")}
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
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("לקוחה", "العميلة", "Customer")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("תאריך ושעה", "التاريخ والوقت", "Date & Time")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell">{L("טלפון", "الهاتف", "Phone")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">{L("שירות", "الخدمة", "Service")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("מחיר", "السعر", "Price")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("סטטוס", "الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a.id} className="border-t border-border/10 hover:bg-surface/30 transition-colors">
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground shrink-0">
                          {(a.customer_name ?? "?")[0]}
                        </div>
                        <span className="font-medium text-foreground">{a.customer_name}</span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <span className="text-foreground">{a.appointment_date}</span>
                        {a.appointment_time && (
                          <>
                            <Clock className="h-3 w-3 text-muted-foreground/40 ms-1.5" />
                            <span className="text-muted-foreground">{a.appointment_time?.slice(0, 5)}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-muted-foreground text-[12px] hidden md:table-cell" dir="ltr">{a.customer_phone}</td>
                    <td className="p-3.5 hidden sm:table-cell">
                      <span className="text-[12px] font-medium text-foreground">
                        {lang === "ar" ? a.service?.name_ar || a.service?.name : a.service?.name}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold">₪{Number(a.total_price).toFixed(0)}</td>
                    <td className="p-3.5">
                      <Select value={a.status} onValueChange={(v) => setStatus(a.id, v)}>
                        <SelectTrigger className={`h-8 w-[130px] rounded-full border text-[11px] font-medium gap-1.5 ${statusColor[a.status] ?? "bg-surface text-muted-foreground border-border/30"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[a.status] ?? "bg-muted-foreground"}`} />
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
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <CalendarDays className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">{search ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found") : L("אין תורים עדיין", "لا مواعيد بعد", "No appointments yet")}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
