import { createServerFn } from "@tanstack/react-start";

export const adminSignUp = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string; full_name: string; phone: string }) => d)
  .handler(async ({ data: { email, password, full_name, phone } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true, email: email.toLowerCase() })
      .eq("id", data.user.id);

    return { userId: data.user.id };
  });
