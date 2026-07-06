import type { Tables } from "@/integrations/supabase/types";

// Plain table row aliases — reused across API handlers and admin/customer UI
// instead of re-declaring the same shape (or reaching for `any`) per file.
export type ProductRow = Tables<"products">;
export type ProductImageRow = Tables<"product_images">;
export type ServiceRow = Tables<"services">;
export type OrderRow = Tables<"orders">;
export type OrderItemRow = Tables<"order_items">;
export type AppointmentRow = Tables<"appointments">;
export type ProfileRow = Tables<"profiles">;
export type BusinessSettingsRow = Tables<"business_settings">;
export type AvailabilitySettingsRow = Tables<"availability_settings">;
export type FavoriteRow = Tables<"favorites">;

// Composite shapes matching specific joined selects used across the app —
// named after the query that produces them, not the table alone.

/** getUserOrders(): orders.select("*, order_items(*)") */
export type UserOrderRow = OrderRow & { order_items: OrderItemRow[] };

/** getAdminAppointments(): appointments.select("*, service:services(name,name_ar)") */
export type AdminAppointmentRow = AppointmentRow & {
  service: Pick<ServiceRow, "name" | "name_ar"> | null;
};

/** getUserAppointments(): appointments.select("*, services(name,name_ar,image_url)") */
export type UserAppointmentRow = AppointmentRow & {
  services: Pick<ServiceRow, "name" | "name_ar" | "image_url"> | null;
};

// Admin record-dialog form-value shapes — the fields saveProduct()/
// saveService() actually accept, plus `id` (present when editing an
// existing row, used only to distinguish "editing" from "new" and to key
// the dialog — never itself rendered as a form field). All optional: a
// new record starts out mostly empty, and an edited one loads a real row
// whose nullable columns can genuinely be `null`.
export type ProductFormValues = Partial<
  Pick<
    ProductRow,
    | "id"
    | "name"
    | "name_ar"
    | "name_en"
    | "description"
    | "description_ar"
    | "description_en"
    | "category"
    | "image_url"
    | "price"
    | "skin_type"
    | "stock_quantity"
    | "low_stock_threshold"
    | "is_active"
  >
>;

export type ServiceFormValues = Partial<
  Pick<
    ServiceRow,
    | "id"
    | "name"
    | "name_ar"
    | "name_en"
    | "description"
    | "description_ar"
    | "description_en"
    | "category"
    | "image_url"
    | "price"
    | "duration_minutes"
    | "is_active"
  >
>;
