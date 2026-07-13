import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, saveSettings } from "@/api/settings/settings";
import { uploadAdminImage } from "@/api/storage/storage";
import { resizeImageForUpload } from "@/lib/image-resize";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  X,
  Loader2,
  Building2,
  Phone,
  MapPin,
  Image as ImageIcon,
  Clock,
  ArrowRight,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";
import {
  getMapEmbedSrc,
  getFindOnMapsUrl,
  isValidLatitude,
  isValidLongitude,
} from "@/lib/location";
import { getErrorMessage } from "@/lib/utils";
import type { BusinessSettingsRow } from "@/lib/api-types";

export const Route = createFileRoute("/admin/settings")({
  // See admin.index.tsx for why this loader exists and why it swallows errors.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["admin-settings"],
        queryFn: () => getSettings(),
      });
    } catch {
      // handled by AdminLayout's redirect
    }
  },
  pendingComponent: () => (
    <div className="min-h-[40vh] grid place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
  component: Page,
});

// Mirrors BusinessSettingsRow, except latitude/longitude are held as the
// raw string the number input produces while being edited (parsed back to
// a number only on save) — everything else matches the row shape exactly.
type SettingsFormState = Partial<Omit<BusinessSettingsRow, "latitude" | "longitude">> & {
  latitude?: string | number | null;
  longitude?: string | number | null;
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// This is the SOURCE file size cap, before client-side resizing — generous
// because resizeImageForUpload downscales/recompresses before anything is
// sent to the server, so the actual upload payload ends up small and
// reliable regardless of how large the original photo was. Without that
// resize step, a raw file anywhere near this size would base64-encode to
// well over hosting platforms' request body limits (commonly ~4.5MB) and
// simply fail with no clear reason why — this is what used to make
// uploads "not always work."
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const UPLOAD_ERROR_MAP: Record<string, string> = {
  INVALID_FILE_TYPE: "Please select a JPEG, PNG, or WEBP image",
  FILE_TOO_LARGE: "Image must be under 20MB",
  INVALID_FOLDER: "Upload failed",
  INVALID_FILE: "Please select a valid image file",
  UPLOAD_FAILED: "Upload failed, please try again",
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Uploads go through the requireAdmin-protected uploadAdminImage server
// function — the browser never writes to Supabase Storage directly. The
// file is resized/recompressed client-side first (see image-resize.ts) so
// the actual network payload stays small and sharp regardless of how large
// the original photo was.
async function uploadFile(file: File, folder: string): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    toast.error(UPLOAD_ERROR_MAP.INVALID_FILE_TYPE);
    return null;
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error(UPLOAD_ERROR_MAP.FILE_TOO_LARGE);
    return null;
  }
  try {
    const { blob, contentType } = await resizeImageForUpload(file);
    const base64 = await blobToBase64(blob);
    const { publicUrl } = await uploadAdminImage({
      data: { folder, contentType, base64 },
    });
    return publicUrl;
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    toast.error(UPLOAD_ERROR_MAP[message] ?? "Upload failed, please try again");
    return null;
  }
}

function ImageUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(UPLOAD_ERROR_MAP.INVALID_FILE_TYPE);
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
      <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>

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
          className="h-10 rounded-xl text-xs flex-1 border-border/30"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getSettings(),
  });

  const [form, setForm] = useState<SettingsFormState>({});
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  // Debounced live preview so the pin updates a beat after typing stops,
  // instead of reloading the map iframe on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setPreviewSrc(
        getMapEmbedSrc({
          latitude: form.latitude === "" || form.latitude == null ? null : Number(form.latitude),
          longitude:
            form.longitude === "" || form.longitude == null ? null : Number(form.longitude),
          address: form.address,
          business_name: form.business_name,
        }),
      );
    }, 500);
    return () => clearTimeout(id);
  }, [form.latitude, form.longitude, form.address, form.business_name]);

  const latNum = form.latitude === "" || form.latitude == null ? null : Number(form.latitude);
  const lngNum = form.longitude === "" || form.longitude == null ? null : Number(form.longitude);
  const latError = latNum != null && !isValidLatitude(latNum);
  const lngError = lngNum != null && !isValidLongitude(lngNum);

  const save = async () => {
    if (saving) return; // Guards against a double-click creating two rows
    // on the very first-ever save, before `data`/`form.id` come back from
    // the invalidated query — there's no row to update yet at that point,
    // so a second concurrent click would insert a second one.

    if (latError || lngError) {
      toast.error(
        L(
          "קואורדינטות לא תקינות. קו רוחב חייב להיות בין 90- ל-90, קו אורך בין 180- ל-180.",
          "إحداثيات غير صالحة. خط العرض بين 90- و90، خط الطول بين 180- و180.",
          "Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.",
        ),
      );
      return;
    }

    const payload = {
      business_name: form.business_name || "Najla Cosmetics",
      address: form.address || null,
      phone: form.phone || null,
      whatsapp_number: form.whatsapp_number || null,
      google_maps_url: form.google_maps_url || null,
      hero_image_url: form.hero_image_url || null,
      about_image_url: form.about_image_url || null,
      products_hero_image_url: form.products_hero_image_url || null,
      latitude: latNum,
      longitude: lngNum,
    };

    setSaving(true);
    try {
      await saveSettings({ data: { id: form.id, payload } });
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["business_settings"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Loads straight into a spinner instead of the form briefly appearing
  // empty — filling the fields in only for the useEffect above to
  // overwrite them a beat later with the real values once `data` arrives.
  if (isLoading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Reveal direction="up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("הגדרות העסק", "إعدادات العمل", "Business Settings")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {L(
                "ניהול פרטי העסק והגדרות",
                "إدارة بيانات العمل والإعدادات",
                "Manage your business details and preferences",
              )}
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {L("שמירה", "حفظ", "Save")}
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
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("פרטי עסק", "بيانات العمل", "Business Information")}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("שם העסק", "اسم العمل", "Business Name")}
              </Label>
              <Input
                value={form.business_name ?? ""}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="h-10 rounded-xl border-border/30"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("טלפון", "الهاتف", "Phone")}
              </Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-10 rounded-xl border-border/30"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("WhatsApp", "واتساب", "WhatsApp")}
              </Label>
              <Input
                value={form.whatsapp_number ?? ""}
                onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                className="h-10 rounded-xl border-border/30"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("קישור Google Maps", "رابط خرائط Google", "Google Maps URL")}
              </Label>
              <Input
                type="url"
                value={form.google_maps_url ?? ""}
                onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })}
                className="h-10 rounded-xl border-border/30"
              />
            </div>
          </div>

          <div className="grid gap-2 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("כתובת", "العنوان", "Address")}
              </Label>
              <a
                href={getFindOnMapsUrl(form.address)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <Search className="h-3 w-3" />
                {L("חיפוש ב-Google Maps", "بحث في Google Maps", "Find on Google Maps")}
              </a>
            </div>
            <Textarea
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="rounded-xl border-border/30"
            />
            <p className="text-[11px] text-muted-foreground">
              {L(
                "כתובת זו קובעת את המיקום במפה אם לא הוזנו קואורדינטות מדויקות למטה.",
                "يحدد هذا العنوان الموقع على الخريطة إذا لم يتم إدخال إحداثيات دقيقة أدناه.",
                "This address sets the map location if no precise coordinates are entered below.",
              )}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("קו רוחב (Latitude)", "خط العرض (Latitude)", "Latitude")}
              </Label>
              <Input
                type="number"
                step="any"
                dir="ltr"
                placeholder="32.6996"
                value={form.latitude ?? ""}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                className={`h-10 rounded-xl ${latError ? "border-destructive focus-visible:ring-destructive/30" : "border-border/30"}`}
              />
              {latError && (
                <p className="text-[11px] text-destructive">
                  {L(
                    "חייב להיות בין 90- ל-90",
                    "يجب أن يكون بين 90- و90",
                    "Must be between -90 and 90",
                  )}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("קו אורך (Longitude)", "خط الطول (Longitude)", "Longitude")}
              </Label>
              <Input
                type="number"
                step="any"
                dir="ltr"
                placeholder="35.3035"
                value={form.longitude ?? ""}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                className={`h-10 rounded-xl ${lngError ? "border-destructive focus-visible:ring-destructive/30" : "border-border/30"}`}
              />
              {lngError && (
                <p className="text-[11px] text-destructive">
                  {L(
                    "חייב להיות בין 180- ל-180",
                    "يجب أن يكون بين 180- و180",
                    "Must be between -180 and 180",
                  )}
                </p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {L(
              "להצגת המיקום המדויק ביותר במפה, ב-Google Maps ובוויז — פתחי את המיקום שלך ב-Google Maps, לחצי לחיצה ימנית על הנקודה המדויקת ובחרי בקואורדינטות המוצגות כדי להעתיק אותן לכאן.",
              "لعرض الموقع الأدق على الخريطة وفي Google Maps و Waze — افتحي موقعك في Google Maps، انقري بزر الفأرة الأيمن على النقطة الدقيقة، وانسخي الإحداثيات الظاهرة إلى هنا.",
              "For the most accurate pin on the map, Google Maps, and Waze — open your location in Google Maps, right-click the exact spot, and copy the coordinates shown into these fields.",
            )}
          </p>

          {/* Live preview — exactly what visitors will see */}
          <div className="grid gap-2 mt-4">
            <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {L("תצוגה מקדימה של המפה", "معاينة الخريطة", "Map Preview")}
            </Label>
            <div className="rounded-xl border border-border/20 overflow-hidden h-[240px] bg-surface">
              {previewSrc && (
                <iframe
                  title="Map preview"
                  src={previewSrc}
                  className="h-full w-full"
                  loading="lazy"
                />
              )}
            </div>
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
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-terracotta-soft">
              <ImageIcon className="h-4 w-4 text-terracotta" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("תמונות", "الصور", "Images")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <ImageUpload
              label={L(
                "תמונת Hero (עמוד הבית)",
                "صورة الواجهة (الصفحة الرئيسية)",
                "Hero Image (Home Page)",
              )}
              value={form.hero_image_url ?? ""}
              onChange={(url) => setForm({ ...form, hero_image_url: url })}
            />
            <ImageUpload
              label={L("תמונת אודות", "صورة عنا", "About Image")}
              value={form.about_image_url ?? ""}
              onChange={(url) => setForm({ ...form, about_image_url: url })}
            />
            <ImageUpload
              label={L(
                "תמונת Hero (עמוד המוצרים)",
                "صورة الواجهة (صفحة المنتجات)",
                "Hero Image (Products Page)",
              )}
              value={form.products_hero_image_url ?? ""}
              onChange={(url) => setForm({ ...form, products_hero_image_url: url })}
            />
          </div>
        </div>
      </Reveal>

      {/* Working hours now live entirely on the Availability page — this
          used to be a second, disconnected "hours" field here that saved
          successfully but was never actually displayed anywhere on the
          site, which just caused confusion. One real source of hours now. */}
      <Reveal direction="up" delay={3}>
        <Link
          to="/admin/slots"
          className="flex items-center justify-between gap-3 rounded-2xl bg-card p-5 sm:p-6 border border-border/10 hover:border-primary/30 transition-colors group"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-sage-soft shrink-0">
              <Clock className="h-4 w-4 text-sage" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">
                {L("שעות פעילות", "ساعات العمل", "Working Hours")}
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {L(
                  "שעות הפעילות האמיתיות מנוהלות בעמוד הזמינות — הן קובעות גם אילו תורים ניתן להזמין.",
                  "ساعات العمل الفعلية تُدار في صفحة التوفر — وهي نفسها التي تحدد المواعيد القابلة للحجز.",
                  "Real working hours are managed on the Availability page — the same hours that control which appointments can be booked.",
                )}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform" />
        </Link>
      </Reveal>

      {/* Mobile save button */}
      <Reveal direction="up" delay={4}>
        <div className="sm:hidden">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-foreground text-background py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {L("שמירה", "حفظ", "Save Changes")}
          </button>
        </div>
      </Reveal>
    </div>
  );
}
