import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
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
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id,name,name_ar").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["admin-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*, service:services(name,name_ar)")
        .order("slot_date", { ascending: false })
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-slots"] });

  const add = async () => {
    if (!form.service_id || !form.slot_date) { toast.error("Select service and date"); return; }
    const { error } = await supabase.from("appointment_slots").insert({ ...form, is_available: true });
    if (error) toast.error(error.message);
    else { toast.success("Slot added"); refresh(); }
  };

  const toggle = async (s: any) => {
    const { error } = await supabase.from("appointment_slots").update({ is_available: !s.is_available }).eq("id", s.id);
    if (error) toast.error(error.message); else refresh();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    const { error } = await supabase.from("appointment_slots").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <h1 className="font-display text-[26px] sm:text-[30px]">{L("חלונות זמן", "أوقات الحجز", "Appointment Slots")}</h1>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card p-4" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          <div className="grid sm:grid-cols-5 gap-3 items-end">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("שירות", "الخدمة", "Service")}</Label>
              <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
                <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar || s.name : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("תאריך", "التاريخ", "Date")}</Label>
              <Input type="date" value={form.slot_date} onChange={(e) => setForm({ ...form, slot_date: e.target.value })} className="h-10 rounded-lg" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("התחלה", "البداية", "Start")}</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="h-10 rounded-lg" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("סיום", "النهاية", "End")}</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="h-10 rounded-lg" />
            </div>
            <button onClick={add} className="bg-foreground text-background px-5 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 sm:col-span-5 sm:w-fit">
              <Plus className="h-4 w-4" />{L("הוסף", "أضف", "Add")}
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal direction="up" delay={2}>
        <div className="rounded-2xl bg-card overflow-hidden" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground">
                <tr>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שירות", "الخدمة", "Service")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("תאריך", "التاريخ", "Date")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("שעות", "الوقت", "Time")}</th>
                  <th className="text-start p-3 text-[11px] font-bold uppercase tracking-[0.08em]">{L("זמין", "متاح", "Available")}</th>
                  <th className="text-end p-3"></th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s: any) => (
                  <tr key={s.id} className="border-t border-border/20 hover:bg-surface/50 transition-colors">
                    <td className="p-3">{lang === "ar" ? s.service?.name_ar || s.service?.name : s.service?.name}</td>
                    <td className="p-3">{s.slot_date}</td>
                    <td className="p-3">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</td>
                    <td className="p-3"><Switch checked={s.is_available} onCheckedChange={() => toggle(s)} /></td>
                    <td className="p-3 text-end"><Button size="icon" variant="ghost" onClick={() => del(s.id)} className="h-8 w-8 rounded-lg"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                  </tr>
                ))}
                {slots.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
