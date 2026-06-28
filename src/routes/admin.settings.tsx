import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSettings, saveSettings } from "@/api/settings/settings";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Loader2, Building2, Phone, MapPin, Image as ImageIcon, Clock as ClockIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/settings")({ component: Page });

async function uploadFile(file: File, folder: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const name = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("images").upload(name, file, { upsert: true });
  if (error) {
    toast.error(error.message);
    return null;
  }
  const { data } = supabase.storage.from("images").getPublicUrl(name);
  return data.publicUrl;
}

function ImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Please select an image or video file");
      return;
    }

    setUploading(true);
    const url = await uploadFile(file, "settings");
    setUploading(false);

    if (url) {
      onChange(url);
      toast.success("Uploaded!");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid gap-3">
      <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</Label>

      {value && (
        <div className="relative rounded-xl overflow-hidden bg-surface aspect-video max-h-[180px] border border-border/10">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onChange("")}
            className="absolute top-2.5 end-2.5 grid h-7 w-7 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/50 text-[12px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : "Choose File"}
        </button>
        <Input
          type="url"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste URL..."
          className="h-10 rounded-xl text-xs flex-1 border-border/30"
        />
      </div>

      <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getSettings(),
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

    try {
      await saveSettings({ data: { id: form.id, payload } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["business_settings"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <Reveal direction="up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">{L("הגדרות העסק", "إعدادات العمل", "Business Settings")}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{L("ניהול פרטי העסק והגדרות", "إدارة بيانات العمل والإعدادات", "Manage your business details and preferences")}</p>
          </div>
          <button
            onClick={save}
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />{L("שמירה", "حفظ", "Save")}
          </button>
        </div>
      </Reveal>

      {/* Business Info Section */}
      <Reveal direction="up" delay={1}>
        <div
          className="rounded-2xl bg-card p-5 sm:p-6 border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">{L("פרטי עסק", "بيانات العمل", "Business Information")}</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("שם העסק", "اسم العمل", "Business Name")}</Label>
              <Input value={form.business_name ?? ""} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("טלפון", "الهاتف", "Phone")}</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("WhatsApp", "واتساب", "WhatsApp")}</Label>
              <Input value={form.whatsapp_number ?? ""} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("קישור Google Maps", "رابط خرائط Google", "Google Maps URL")}</Label>
              <Input type="url" value={form.google_maps_url ?? ""} onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })} className="h-10 rounded-xl border-border/30" />
            </div>
          </div>

          <div className="grid gap-2 mt-4">
            <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{L("כתובת", "العنوان", "Address")}</Label>
            <Textarea value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="rounded-xl border-border/30" />
          </div>
        </div>
      </Reveal>

      {/* Images Section */}
      <Reveal direction="up" delay={2}>
        <div
          className="rounded-2xl bg-card p-5 sm:p-6 border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50">
              <ImageIcon className="h-4 w-4 text-purple-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">{L("תמונות", "الصور", "Images")}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <ImageUpload
              label={L("תמונת Hero", "صورة الواجهة", "Hero Image")}
              value={form.hero_image_url ?? ""}
              onChange={(url) => setForm({ ...form, hero_image_url: url })}
            />
            <ImageUpload
              label={L("תמונת אודות", "صورة عنا", "About Image")}
              value={form.about_image_url ?? ""}
              onChange={(url) => setForm({ ...form, about_image_url: url })}
            />
          </div>
        </div>
      </Reveal>

      {/* Working Hours Section */}
      <Reveal direction="up" delay={3}>
        <div
          className="rounded-2xl bg-card p-5 sm:p-6 border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50">
              <ClockIcon className="h-4 w-4 text-emerald-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">{L("שעות פעילות", "ساعات العمل", "Working Hours")}</h2>
          </div>
          <Textarea
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            rows={8}
            className="font-mono text-xs rounded-xl border-border/30"
            placeholder='{"sun":"09:00-18:00","mon":"09:00-18:00"}'
          />
        </div>
      </Reveal>

      {/* Mobile save button */}
      <Reveal direction="up" delay={4}>
        <div className="sm:hidden">
          <button
            onClick={save}
            className="w-full bg-foreground text-background py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />{L("שמירה", "حفظ", "Save Changes")}
          </button>
        </div>
      </Reveal>
    </div>
  );
}
