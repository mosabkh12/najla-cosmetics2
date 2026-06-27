import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";

export const getTakenTimes = createServerFn({ method: "GET" })
  .validator((d: { serviceId: string; date: string }) => d)
  .handler(async ({ data: { serviceId, date } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("appointments").select("appointment_time").eq("service_id", serviceId).eq("appointment_date", date).neq("status", "cancelled");
    return (data ?? []).map((r) => String(r.appointment_time).slice(0, 5));
  });

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { service_id: string; appointment_date: string; appointment_time: string; customer_name: string; customer_phone: string; notes: string | null; total_price: number }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").insert({
      user_id: context.userId,
      service_id: data.service_id,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      notes: data.notes,
      status: "pending",
      total_price: data.total_price,
    });
    if (error) throw error;
    return { success: true };
  });

export const getUserAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("appointments").select("*, services(name,name_ar,image_url)").eq("user_id", context.userId).order("appointment_date", { ascending: false });
    return data ?? [];
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id }, context }) => {
    const { error } = await context.supabase.from("appointments").update({ status: "cancelled" }).eq("id", id).eq("user_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const getAdminAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("appointments").select("*, service:services(name,name_ar)").order("appointment_date", { ascending: false }).order("appointment_time", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("appointments").update({ status: status as any }).eq("id", id);
    if (error) throw error;
    return { success: true };
  });
