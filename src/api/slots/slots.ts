import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../admin/middleware";

export const getAdminSlotServices = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("services").select("id,name,name_ar").eq("is_active", true).order("name");
    return data ?? [];
  });

export const getAdminSlots = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("appointment_slots").select("*, service:services(name,name_ar)").order("slot_date", { ascending: false }).order("start_time");
    if (error) throw error;
    return data ?? [];
  });

export const createSlot = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { service_id: string; slot_date: string; start_time: string; end_time: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("appointment_slots").insert({ ...data, is_available: true });
    if (error) throw error;
    return { success: true };
  });

export const toggleSlot = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; currentAvailable: boolean }) => d)
  .handler(async ({ data: { id, currentAvailable } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("appointment_slots").update({ is_available: !currentAvailable }).eq("id", id);
    if (error) throw error;
    return { success: true };
  });

export const deleteSlot = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("appointment_slots").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  });
