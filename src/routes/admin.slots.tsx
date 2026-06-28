import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminSlotServices, getAdminSlots, createSlot, toggleSlot, deleteSlot } from "@/api/slots/slots";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/slots")({ component: Page });

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const [form, setForm] = useState({ service_id: "", slot_date: "", start_time: "10:00", end_time: "11:00" });

  const { data: services = [] } = useQuery({
    queryKey: ["admin-slots-services"],
    queryFn: () => getAdminSlotServices(),
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["admin-slots"],
    queryFn: () => getAdminSlots(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-slots"] });

  const add = async () => {
    if (!form.service_id || !form.slot_date) { toast.error("Select service and date"); return; }
    try {
      await createSlot({ data: form });
      toast.success("Slot added");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggle = async (s: any) => {
    try {
      await toggleSlot({ data: { id: s.id, currentAvailable: s.is_available } });
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    try {
      await deleteSlot({ data: { id } });
      toast.success("Deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div>
          <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">{L("חלונות זמן", "أوقات الحجز", "Appointment Slots")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{L(`${slots.length} חלונות`, `${slots.length} أوقات`, `${slots.length} slots`)}</p>
        </div>
      </Reveal>

      {/* Add slot form */}
      <Reveal direction="up" delay={1}>
        <div
          className="rounded-2xl bg-card p-5 sm:p-6 border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50">
              <Plus className="h-4 w-4 text-blue-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">{L("הוספת חלון זמן", "إضافة وقت جديد", "Add New Slot")}</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="grid gap-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("שירות", "الخدمة", "Service")}</Label>
              <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
                <SelectTrigger className="h-10 rounded-xl border-border/30"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar || s.name : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("תאריך", "التاريخ", "Date")}</Label>
              <Input type="date" value={form.slot_date} onChange={(e) => setForm({ ...form, slot_date: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("התחלה", "البداية", "Start")}</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("סיום", "النهاية", "End")}</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={add}
              className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />{L("הוסף חלון", "أضف وقتاً", "Add Slot")}
            </button>
          </div>
        </div>
      </Reveal>

      {/* Slots table */}
      <Reveal direction="up" delay={2}>
        <div
          className="rounded-2xl bg-card overflow-hidden border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface/60 border-b border-border/15">
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("שירות", "الخدمة", "Service")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("תאריך", "التاريخ", "Date")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("שעות", "الوقت", "Time")}</th>
                  <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("זמין", "متاح", "Available")}</th>
                  <th className="text-end p-3.5 w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s: any) => (
                  <tr key={s.id} className="border-t border-border/10 hover:bg-surface/30 transition-colors">
                    <td className="p-3.5">
                      <span className="font-medium text-foreground">{lang === "ar" ? s.service?.name_ar || s.service?.name : s.service?.name}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {s.slot_date}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground font-medium bg-surface px-2.5 py-1 rounded-lg">
                        <Clock className="h-3 w-3 text-muted-foreground/60" />
                        {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <Switch checked={s.is_available} onCheckedChange={() => toggle(s)} />
                        <span className={`text-[11px] font-medium ${s.is_available ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {s.is_available ? L("זמין", "متاح", "Open") : L("סגור", "مغلق", "Closed")}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 text-end">
                      <Button size="icon" variant="ghost" onClick={() => del(s.id)} className="h-8 w-8 rounded-lg hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {slots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Clock className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <div className="text-[14px] font-medium text-muted-foreground">{L("אין חלונות זמן", "لا أوقات حجز", "No slots configured")}</div>
                      <div className="text-[12px] text-muted-foreground/60 mt-1">{L("הוסף חלון זמן ראשון למעלה", "أضف أول وقت أعلاه", "Add your first slot using the form above")}</div>
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
