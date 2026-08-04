// Every outgoing email (OTP, booking, order, back-in-stock) needs to show
// the admin's actual configured business name/address, not a hardcoded
// placeholder — this is the single source of truth each email template
// reads from, so there's exactly one query to update if business_settings
// ever gains more admin-facing branding fields (logo, tagline, etc).
export interface EmailBrand {
  businessName: string;
  address: string | null;
  phone: string | null;
  whatsappNumber: string | null;
}

const DEFAULT_BUSINESS_NAME = "Najla Cosmetics";

export async function getEmailBrand(): Promise<EmailBrand> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("business_settings")
    .select("business_name, address, phone, whatsapp_number")
    .eq("singleton", true)
    .maybeSingle();

  // Unlike getSettings(), a failure here intentionally still falls back
  // to the generic default rather than throwing: every caller (OTP,
  // order, appointment, back-in-stock emails) is a transactional send
  // that should still go out — with a generic-but-correct business name
  // — rather than fail outright because branding couldn't be loaded.
  // The failure is still logged, not silently hidden, so it's visible
  // in server logs even though the caller-facing behavior stays graceful.
  if (error) {
    console.error("[getEmailBrand] query failed, using default branding", error);
  }

  return {
    businessName: data?.business_name || DEFAULT_BUSINESS_NAME,
    address: data?.address || null,
    phone: data?.phone || null,
    whatsappNumber: data?.whatsapp_number || null,
  };
}
