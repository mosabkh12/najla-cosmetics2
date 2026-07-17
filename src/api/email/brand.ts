// Every outgoing email (OTP, booking, order, back-in-stock) needs to show
// the admin's actual configured business name/address, not a hardcoded
// placeholder — this is the single source of truth each email template
// reads from, so there's exactly one query to update if business_settings
// ever gains more admin-facing branding fields (logo, tagline, etc).
export interface EmailBrand {
  businessName: string;
  address: string | null;
}

const DEFAULT_BUSINESS_NAME = "Najla Cosmetics";

export async function getEmailBrand(): Promise<EmailBrand> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("business_settings")
    .select("business_name, address")
    .maybeSingle();

  return {
    businessName: data?.business_name || DEFAULT_BUSINESS_NAME,
    address: data?.address || null,
  };
}
