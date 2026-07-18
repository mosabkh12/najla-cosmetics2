import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ALLOWED_IMAGE_TYPES,
  UPLOAD_ERROR_MAP,
  uploadImageFile,
  uploadImageWithThumbnail,
} from "@/lib/upload-image";

export function ImageUploadField({
  label,
  value,
  onChange,
  folder,
  onThumbnailChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: string;
  // When provided, a small grid-card thumbnail is generated and uploaded
  // alongside the full image (see uploadImageWithThumbnail) — used for
  // products/services, whose photos also render as small cards across
  // the site. Omit for single-use images (settings hero/about) that are
  // never shown at thumbnail size.
  onThumbnailChange?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Shows the picked file instantly via a local object URL, before the
  // resize/upload round-trip even starts — otherwise the preview only
  // updates once uploadAdminImage returns, so the whole pipeline (resize →
  // base64 → network) has to finish before anything visibly changes.
  // Revoked as soon as it's no longer needed (upload settles or another
  // file is picked) so object URLs don't leak.
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(UPLOAD_ERROR_MAP.INVALID_FILE_TYPE);
      return;
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewRef.current = objectUrl;
    setPreview(objectUrl);

    setUploading(true);
    if (onThumbnailChange) {
      const result = await uploadImageWithThumbnail(file, folder);
      setUploading(false);
      if (result) {
        onChange(result.url);
        onThumbnailChange(result.thumbnailUrl);
        toast.success("Uploaded!");
      }
    } else {
      const url = await uploadImageFile(file, folder);
      setUploading(false);
      if (url) {
        onChange(url);
        toast.success("Uploaded!");
      }
    }
    if (previewRef.current === objectUrl) {
      URL.revokeObjectURL(objectUrl);
      previewRef.current = null;
      setPreview(null);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const displayUrl = preview ?? value;

  return (
    <div className="grid gap-3">
      <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>

      {displayUrl && (
        <div className="relative rounded-xl overflow-hidden bg-surface aspect-video max-h-[180px] border border-border/10">
          <img src={displayUrl} alt="" className="w-full h-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px] grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-background" aria-hidden="true" />
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                onThumbnailChange?.("");
              }}
              className="absolute top-2.5 end-2.5 grid h-7 w-7 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
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
