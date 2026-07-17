import { sendMail } from "./mailer";
import { BRAND, escapeHtml, row, wrap, type Lang } from "./appointment-emails";
import { getEmailBrand } from "./brand";

const DIR: Record<Lang, "rtl" | "ltr"> = { he: "rtl", ar: "rtl", en: "ltr" };

function pick<T>(lang: Lang, values: Record<Lang, T>): T {
  return values[lang] ?? values.he;
}

const ORDER_STATUS_LABELS: Record<string, { he: string; ar: string; en: string; color: string }> = {
  pending: { he: "ממתין לאישור", ar: "قيد الانتظار", en: "Pending", color: "#b8860b" },
  confirmed: { he: "אושר", ar: "تم التأكيد", en: "Confirmed", color: "#2563eb" },
  preparing: { he: "בהכנה", ar: "قيد التحضير", en: "Preparing", color: "#c2703d" },
  completed: { he: "הושלם", ar: "مكتمل", en: "Completed", color: "#059669" },
  cancelled: { he: "בוטל", ar: "ملغي", en: "Cancelled", color: "#dc2626" },
};

const FIELD_LABELS: Record<
  Lang,
  { orderNumber: string; delivery: string; address: string; total: string }
> = {
  he: { orderNumber: "מספר הזמנה", delivery: "משלוח", address: "כתובת", total: "סך הכל" },
  ar: { orderNumber: "رقم الطلب", delivery: "التوصيل", address: "العنوان", total: "المجموع" },
  en: { orderNumber: "Order #", delivery: "Delivery", address: "Address", total: "Total" },
};

const PICKUP_LABEL: Record<Lang, string> = {
  he: "איסוף עצמי",
  ar: "الاستلام من المتجر",
  en: "Store Pickup",
};

export interface OrderItemDetail {
  productName: string;
  quantity: number;
  totalPrice: number;
}

interface OrderDeliveryInfo {
  method: "pickup" | "delivery";
  areaName: string | null;
  fee: number;
  street: string | null;
}

function orderTable(
  lang: Lang,
  items: OrderItemDetail[],
  delivery: OrderDeliveryInfo,
  total: number,
) {
  const labels = FIELD_LABELS[lang];
  const itemRows = items
    .map((it) => row(`${escapeHtml(it.productName)} × ${it.quantity}`, `₪${it.totalPrice}`))
    .join("");

  const deliveryValue =
    delivery.method === "delivery"
      ? `${escapeHtml(delivery.areaName ?? "")} · ₪${delivery.fee}`
      : PICKUP_LABEL[lang];

  const streetRow =
    delivery.method === "delivery" && delivery.street
      ? row(labels.address, escapeHtml(delivery.street))
      : "";

  return `<table style="width:100%;border-collapse:collapse;">
    ${itemRows}
    ${row(labels.delivery, deliveryValue)}
    ${streetRow}
  </table>
  <div style="margin-top:16px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.muted};">${labels.total}</span>
    <span style="font-size:18px;font-weight:700;color:${BRAND.text};">₪${total}</span>
  </div>`;
}

interface OrderConfirmationDetails {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  items: OrderItemDetail[];
  delivery: OrderDeliveryInfo;
  total: number;
  lang: Lang;
}

const ORDER_CONFIRMATION_COPY: Record<Lang, { subject: string; title: string; intro: string }> = {
  he: {
    subject: "ההזמנה התקבלה",
    title: "אישור הזמנה",
    intro: "תודה על ההזמנה! אנו מכינים אותה בשבילך.",
  },
  ar: {
    subject: "تم استلام طلبك",
    title: "تأكيد الطلب",
    intro: "شكراً لطلبك! نقوم بتجهيزه لكِ.",
  },
  en: {
    subject: "Order Received",
    title: "Order Confirmation",
    intro: "Thank you for your order! We're getting it ready for you.",
  },
};

export async function sendOrderConfirmation(details: OrderConfirmationDetails) {
  const brand = await getEmailBrand();
  const copy = pick(details.lang, ORDER_CONFIRMATION_COPY);
  const greeting = pick(details.lang, { he: "שלום", ar: "مرحباً", en: "Hi" });
  const labels = FIELD_LABELS[details.lang];
  const pendingLabel = ORDER_STATUS_LABELS.pending[details.lang];

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    <p style="font-size:12px;color:${BRAND.muted};margin:0 0 12px;">${labels.orderNumber}: <strong style="color:${BRAND.text};">#${escapeHtml(details.orderNumber)}</strong></p>
    ${orderTable(details.lang, details.items, details.delivery, details.total)}
    <div style="margin-top:12px;text-align:center;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${ORDER_STATUS_LABELS.pending.color};">${pendingLabel}</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `${brand.businessName} — ${copy.subject}`,
    wrap(copy.title, body, DIR[details.lang], brand),
  );
}

// Always in a fixed layout/language regardless of the customer's own
// language — lands in the business owner's inbox, not the customer's.
export async function sendAdminOrderNotification(
  details: Omit<OrderConfirmationDetails, "lang"> & { customerPhone: string },
) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;

  const brand = await getEmailBrand();
  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">A new order has been placed:</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Customer", escapeHtml(details.customerName))}
      ${row("Phone", escapeHtml(details.customerPhone))}
      ${row("Email", details.customerEmail)}
      ${row("Order #", `#${escapeHtml(details.orderNumber)}`)}
    </table>
    <div style="margin-top:12px;">
      ${orderTable("en", details.items, details.delivery, details.total)}
    </div>`;

  await sendMail(
    adminEmail,
    `New Order — ${details.customerName} · #${details.orderNumber}`,
    wrap("New Order", body, "ltr", brand),
  );
}

interface OrderStatusUpdateDetails {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  status: string;
  lang: Lang;
}

const ORDER_STATUS_UPDATE_COPY: Record<
  Lang,
  { title: string; intro: string; subjectPrefix: string }
> = {
  he: {
    title: "עדכון הזמנה",
    intro: "סטטוס ההזמנה שלך עודכן.",
    subjectPrefix: "ההזמנה",
  },
  ar: {
    title: "تحديث الطلب",
    intro: "تم تحديث حالة طلبك.",
    subjectPrefix: "الطلب",
  },
  en: {
    title: "Order Update",
    intro: "Your order status has been updated.",
    subjectPrefix: "Order",
  },
};

export async function sendOrderStatusUpdateEmail(details: OrderStatusUpdateDetails) {
  const label = ORDER_STATUS_LABELS[details.status];
  if (!label) return;

  const brand = await getEmailBrand();
  const copy = pick(details.lang, ORDER_STATUS_UPDATE_COPY);
  const greeting = pick(details.lang, { he: "שלום", ar: "مرحباً", en: "Hi" });
  const labels = FIELD_LABELS[details.lang];
  const statusText = label[details.lang];

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row(labels.orderNumber, `#${escapeHtml(details.orderNumber)}`)}
    </table>
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:${label.color};">${statusText}</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `${brand.businessName} — ${copy.subjectPrefix} ${statusText}`,
    wrap(copy.title, body, DIR[details.lang], brand),
  );
}
