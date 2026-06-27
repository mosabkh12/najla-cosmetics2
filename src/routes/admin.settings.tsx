import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
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
    <div className="grid gap-2">
      <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{label}</Label>

      {/* Preview */}
      {value && (
        <div className="relative rounded-xl overflow-hidden bg-surface aspect-video max-h-[200px]">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onChange("")}
            className="absolute top-2 end-2 grid h-7 w-7 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload area */}
      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 text-[12px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Uploading..." : "Choose File"}
        </button>
        <Input
          type="url"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste URL..."
          className="h-10 rounded-lg text-xs flex-1"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

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
    qc.invalidateQueries({ queryKey: ["business_settings"] });
  };

  const F = (key: string, label: string, type: string = "text") => (
    <div className="grid gap-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{label}</Label>
      <Input type={type} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-10 rounded-lg" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Reveal direction="up">
        <h1 className="font-display text-[26px] sm:text-[30px]">{L("הגדרות העסק", "إعدادات العمل", "Business Settings")}</h1>
      </Reveal>

      <Reveal direction="up" delay={1}>
        <div className="rounded-2xl bg-card p-5 sm:p-6 space-y-5" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
          {/* Basic info */}
          <div className="grid sm:grid-cols-2 gap-3">
            {F("business_name", L("שם העסק", "اسم العمل", "Business Name"))}
            {F("phone", L("טלפון", "الهاتف", "Phone"))}
            {F("whatsapp_number", L("WhatsApp", "واتساب", "WhatsApp"))}
            {F("google_maps_url", L("קישור Google Maps", "رابط خرائط Google", "Google Maps URL"), "url")}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("כתובת", "العنوان", "Address")}</Label>
            <Textarea value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="rounded-lg" />
          </div>

          {/* Image uploads */}
          <div className="pt-2 border-t border-border/20">
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">{L("תמונות", "الصور", "Images")}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
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

          {/* Working hours */}
          <div className="grid gap-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{L("שעות פעילות (JSON)", "ساعات العمل (JSON)", "Working Hours (JSON)")}</Label>
            <Textarea value={hours} onChange={(e) => setHours(e.target.value)} rows={8} className="font-mono text-xs rounded-lg" placeholder='{"sun":"09:00-18:00","mon":"09:00-18:00"}' />
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button onClick={save} className="bg-foreground text-background px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">
              {L("שמירה", "حفظ", "Save")}
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
