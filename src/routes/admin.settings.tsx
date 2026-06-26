import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({ component: Page });

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>({});
  const [hours, setHours] = useState("");

  useEffect(() => {
    if (data) {
      setForm(data);
      setHours(JSON.stringify(data.working_hours ?? {}, null, 2));
    }
  }, [data]);

  const save = async () => {
    let working_hours: any = null;
    try { working_hours = hours.trim() ? JSON.parse(hours) : null; }
    catch { toast.error("Working hours must be valid JSON"); return; }

    const payload = {
      business_name: form.business_name || "Najla Cosmetics",
      address: form.address || null,
      phone: form.phone || null,
      whatsapp_number: form.whatsapp_number || null,
      google_maps_url: form.google_maps_url || null,
      hero_image_url: form.hero_image_url || null,
      about_image_url: form.about_image_url || null,
      working_hours,
    };

    const op = form.id
      ? await supabase.from("business_settings").update(payload).eq("id", form.id)
      : await supabase.from("business_settings").insert(payload);
    if (op.error) { toast.error(op.error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["admin-settings"] });
  };

  const F = (key: string, label: string, type: string = "text") => (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-10" />
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{L("הגדרות העסק", "إعدادات العمل", "Business Settings")}</h1>

      <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {F("business_name", L("שם העסק", "اسم العمل", "Business Name"))}
          {F("phone", L("טלפון", "الهاتف", "Phone"))}
          {F("whatsapp_number", L("WhatsApp", "واتساب", "WhatsApp"))}
          {F("google_maps_url", L("קישור Google Maps", "رابط خرائط Google", "Google Maps URL"), "url")}
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">{L("כתובת", "العنوان", "Address")}</Label>
          <Textarea value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {F("hero_image_url", L("תמונת Hero (URL)", "صورة الواجهة (رابط)", "Hero Image URL"), "url")}
          {F("about_image_url", L("תמונת אודות (URL)", "صورة \"عنا\" (رابط)", "About Image URL"), "url")}
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">{L("שעות פעילות (JSON)", "ساعات العمل (JSON)", "Working Hours (JSON)")}</Label>
          <Textarea value={hours} onChange={(e) => setHours(e.target.value)} rows={8} className="font-mono text-xs" placeholder='{"sun":"09:00-18:00","mon":"09:00-18:00"}' />
        </div>
        <div className="flex justify-end">
          <Button className="btn-gold" onClick={save}>{L("שמירה", "حفظ", "Save")}</Button>
        </div>
      </div>
    </div>
  );
}
