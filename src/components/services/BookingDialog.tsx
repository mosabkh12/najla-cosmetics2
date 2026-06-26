import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n, pickLocalized } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Service } from "@/components/services/ServiceCard";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

export function BookingDialog({ service, open, onOpenChange }: { service: Service | null; open: boolean; onOpenChange: (b: boolean) => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<string[]>([]);

  useEffect(() => {
    if (!service || !date) return;
    supabase.from("appointments").select("appointment_time").eq("service_id", service.id).eq("appointment_date", date).neq("status", "cancelled").then(({ data }) => {
      setTaken((data ?? []).map((r) => String(r.appointment_time).slice(0, 5)));
    });
  }, [service, date]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data) { setName(data.full_name ?? ""); setPhone(data.phone ?? ""); }
      });
    }
  }, [user]);

  if (!service) return null;
  const localized = pickLocalized(lang, service.name, service.name_ar);

  const submit = async () => {
    if (!user) { toast.info(t("sign_in")); onOpenChange(false); navigate({ to: "/auth" }); return; }
    if (!date || !time || !name || !phone) { toast.error("Required fields missing"); return; }
    setBusy(true);
    const [h, m] = time.split(":").map(Number);
    const end = `${String(h + Math.floor((m + service.duration_minutes) / 60)).padStart(2, "0")}:${String((m + service.duration_minutes) % 60).padStart(2, "0")}`;
    const { error } = await supabase.from("appointments").insert({
      user_id: user.id, service_id: service.id, appointment_date: date, appointment_time: time + ":00",
      customer_name: name, customer_phone: phone, notes: notes || null, status: "pending",
      total_price: service.price,
    });
    void end;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("booking_success"));
    onOpenChange(false);
    setTime(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{localized}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="flex justify-between rounded-lg bg-surface p-3 text-sm">
            <span className="text-secondary-foreground">{t("starting_at")}<strong className="text-foreground">₪{service.price}</strong></span>
            <span className="text-secondary-foreground">{service.duration_minutes} {t("minutes")}</span>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("select_date")}</Label>
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10" />
          </div>
          <div>
            <Label className="text-xs font-medium">{t("select_time")}</Label>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {TIMES.map((tm) => {
                const isTaken = taken.includes(tm);
                return (
                  <button key={tm} disabled={isTaken} onClick={() => setTime(tm)} className={`rounded-md border px-1 py-1.5 text-xs font-medium transition ${time === tm ? "border-primary bg-primary text-primary-foreground" : isTaken ? "border-border bg-surface-2 text-muted-foreground line-through opacity-50 cursor-not-allowed" : "border-border bg-card hover:border-primary"}`}>{tm}</button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label className="text-xs font-medium">{t("full_name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10" />
            </div>
            <div>
              <Label className="text-xs font-medium">{t("phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-10" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("notes_optional")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 resize-none" />
          </div>
          <Button onClick={submit} disabled={busy || !time} className="btn-gold w-full h-10">{t("confirm_booking")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
