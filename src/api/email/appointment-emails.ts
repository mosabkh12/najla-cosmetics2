import { sendMail } from "./mailer";

// customerName/customerPhone originate from the booking form (trimmed and
// length-capped, but never HTML-escaped) — everything else here
// (serviceName, date, time, price) comes from admin-controlled data or a
// regex-validated format. Without this, a crafted customer name could
// inject arbitrary HTML into an email that lands in the business owner's
// own inbox (sendAdminBookingNotification).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Kept as a local, self-contained union rather than importing src/lib/i18n
// (a client-facing React module) into server-only email code — the two
// are deliberately decoupled. Every caller sources this from
// profiles.language (see appointments.ts/slots.ts/products.ts) or, for
// the pre-signup OTP email, directly from the client.
export type Lang = "he" | "ar" | "en";

const DIR: Record<Lang, "rtl" | "ltr"> = { he: "rtl", ar: "rtl", en: "ltr" };

function pick<T>(lang: Lang, values: Record<Lang, T>): T {
  return values[lang] ?? values.he;
}

const FIELD_LABELS: Record<
  Lang,
  Record<"service" | "date" | "time" | "duration" | "price", string>
> = {
  he: { service: "שירות", date: "תאריך", time: "שעה", duration: "משך", price: "מחיר" },
  ar: { service: "الخدمة", date: "التاريخ", time: "الوقت", duration: "المدة", price: "السعر" },
  en: { service: "Service", date: "Date", time: "Time", duration: "Duration", price: "Price" },
};

const MINUTES_UNIT: Record<Lang, string> = { he: "דק׳", ar: "د", en: "min" };

interface BookingDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  lang: Lang;
}

export const BRAND = {
  bg: "#faf8f6",
  card: "#ffffff",
  text: "#1b1c1c",
  muted: "#615e57",
  accent: "#c4a882",
  border: "#ece8e3",
};

export function row(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 16px;font-size:13px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${label}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};text-align:end;">${value}</td>
  </tr>`;
}

// dir defaults to "ltr" for sendAdminBookingNotification, the one caller
// that never carries a customer lang (it's always read by the business
// owner, in whatever language their own mail client is set to).
export function wrap(title: string, body: string, dir: "rtl" | "ltr" = "ltr") {
  return `<div dir="${dir}" style="background:${BRAND.bg};padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="font-size:22px;font-weight:600;color:${BRAND.text};margin:0;font-style:italic;">Najla Cosmetics</h1>
    </div>
    <div style="background:${BRAND.card};border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
      <div style="background:${BRAND.text};padding:20px 24px;text-align:center;">
        <h2 style="margin:0;font-size:15px;font-weight:600;color:${BRAND.card};letter-spacing:0.04em;text-transform:uppercase;">${title}</h2>
      </div>
      <div style="padding:24px;">${body}</div>
    </div>
    <p style="text-align:center;font-size:11px;color:${BRAND.muted};margin-top:24px;">© 2026 Najla Cosmetics · Nazareth, Israel</p>
  </div>
</div>`;
}

function detailsTable(d: BookingDetails) {
  const labels = FIELD_LABELS[d.lang];
  return `<table style="width:100%;border-collapse:collapse;">
    ${row(labels.service, d.serviceName)}
    ${row(labels.date, d.date)}
    ${row(labels.time, d.time.slice(0, 5))}
    ${row(labels.duration, `${d.duration} ${MINUTES_UNIT[d.lang]}`)}
    ${row(labels.price, `₪${d.price}`)}
  </table>`;
}

const BOOKING_CONFIRMATION_COPY: Record<
  Lang,
  { subject: string; title: string; intro: string; status: string }
> = {
  he: {
    subject: "Najla Cosmetics — התור התקבל",
    title: "אישור תור",
    intro: "התור שלך נקבע! מצפים לראותך.",
    status: "סטטוס: אושר",
  },
  ar: {
    subject: "Najla Cosmetics — تم استلام الموعد",
    title: "تأكيد الموعد",
    intro: "تم حجز موعدك! نتطلع لرؤيتك.",
    status: "الحالة: تم التأكيد",
  },
  en: {
    subject: "Najla Cosmetics — Appointment Received",
    title: "Appointment Confirmation",
    intro: "Your appointment is booked! We look forward to seeing you.",
    status: "Status: Confirmed",
  },
};

export async function sendBookingConfirmation(details: BookingDetails) {
  const copy = pick(details.lang, BOOKING_CONFIRMATION_COPY);
  const greeting = pick(details.lang, {
    he: "שלום",
    ar: "مرحباً",
    en: "Hi",
  });

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    ${detailsTable(details)}
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.accent};">${copy.status}</span>
    </div>`;

  await sendMail(details.customerEmail, copy.subject, wrap(copy.title, body, DIR[details.lang]));
}

// Always in a fixed layout/language regardless of the customer's own
// language — this lands in the business owner's inbox, not the
// customer's, so it isn't part of the "emails match the customer's
// language" requirement.
export async function sendAdminBookingNotification(details: Omit<BookingDetails, "lang">) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">A new appointment has been booked:</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Customer", escapeHtml(details.customerName))}
      ${row("Phone", escapeHtml(details.customerPhone))}
      ${row("Email", details.customerEmail)}
      ${row("Service", details.serviceName)}
      ${row("Date", details.date)}
      ${row("Time", details.time.slice(0, 5))}
      ${row("Price", `₪${details.price}`)}
    </table>`;

  await sendMail(
    adminEmail,
    `New Booking — ${details.customerName} · ${details.serviceName}`,
    wrap("New Appointment", body),
  );
}

const STATUS_LABELS: Record<string, { en: string; he: string; ar: string; color: string }> = {
  confirmed: { en: "Confirmed", he: "אושר", ar: "تم التأكيد", color: "#2563eb" },
  completed: { en: "Completed", he: "הושלם", ar: "مكتمل", color: "#059669" },
  cancelled: { en: "Cancelled", he: "בוטל", ar: "ملغي", color: "#dc2626" },
};

interface StatusUpdateDetails {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  date: string;
  time: string;
  status: string;
  lang: Lang;
}

const STATUS_UPDATE_COPY: Record<Lang, { title: string; intro: string; subjectPrefix: string }> = {
  he: {
    title: "עדכון תור",
    intro: "סטטוס התור שלך עודכן.",
    subjectPrefix: "Najla Cosmetics — התור",
  },
  ar: {
    title: "تحديث الموعد",
    intro: "تم تحديث حالة موعدك.",
    subjectPrefix: "Najla Cosmetics — الموعد",
  },
  en: {
    title: "Appointment Update",
    intro: "Your appointment status has been updated.",
    subjectPrefix: "Najla Cosmetics — Appointment",
  },
};

export async function sendStatusUpdateEmail(details: StatusUpdateDetails) {
  const label = STATUS_LABELS[details.status];
  if (!label) return;

  const copy = pick(details.lang, STATUS_UPDATE_COPY);
  const greeting = pick(details.lang, { he: "שלום", ar: "مرحباً", en: "Hi" });
  const labels = FIELD_LABELS[details.lang];

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row(labels.service, details.serviceName)}
      ${row(labels.date, details.date)}
      ${row(labels.time, details.time.slice(0, 5))}
    </table>
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:${label.color};">${label[details.lang]}</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `${copy.subjectPrefix} ${label[details.lang]}`,
    wrap(copy.title, body, DIR[details.lang]),
  );
}

interface AvailabilityCancellationDetails {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  date: string;
  time: string;
  lang: Lang;
}

const AVAILABILITY_CANCELLATION_COPY: Record<
  Lang,
  { subject: string; title: string; intro: string; badge: string }
> = {
  he: {
    subject: "Najla Cosmetics — התור בוטל (שינוי בלוח הזמנים)",
    title: "התור בוטל",
    intro:
      "אנו מתנצלות על אי הנוחות — נאלצנו לעדכן את לוח הזמנים שלנו, והתור שלך לא יכול היה להישאר בתוקף. התור בוטל ללא חיוב. נשמח שתקבעי תור חדש בזמן שמתאים לך.",
    badge: "בוטל — שינוי בלוח הזמנים",
  },
  ar: {
    subject: "Najla Cosmetics — تم إلغاء الموعد (تغيير في الجدول)",
    title: "تم إلغاء الموعد",
    intro:
      "نعتذر عن الإزعاج — اضطررنا لتحديث جدولنا، ولم يعد بالإمكان الإبقاء على موعدك. تم إلغاء الموعد دون أي رسوم. يسعدنا أن تحجزي موعداً جديداً في الوقت الذي يناسبك.",
    badge: "ملغى — تغيير في الجدول",
  },
  en: {
    subject: "Najla Cosmetics — Appointment Cancelled (Schedule Change)",
    title: "Appointment Cancelled",
    intro:
      "We're sorry for the inconvenience — we've had to update our schedule, and the appointment below could no longer be kept. It has been cancelled at no charge. Please feel free to book a new time that works for you.",
    badge: "Cancelled — Schedule Change",
  },
};

// Distinct from sendStatusUpdateEmail on purpose — this cancellation isn't
// something the customer did or a normal status change, it's the business
// closing/changing hours out from under an existing booking. Naming that
// plainly is more honest than a generic "your appointment was cancelled".
export async function sendAvailabilityCancellationEmail(details: AvailabilityCancellationDetails) {
  const copy = pick(details.lang, AVAILABILITY_CANCELLATION_COPY);
  const greeting = pick(details.lang, { he: "שלום", ar: "مرحباً", en: "Hi" });
  const labels = FIELD_LABELS[details.lang];

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row(labels.service, escapeHtml(details.serviceName))}
      ${row(labels.date, details.date)}
      ${row(labels.time, details.time.slice(0, 5))}
    </table>
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:#dc2626;">${copy.badge}</span>
    </div>`;

  await sendMail(details.customerEmail, copy.subject, wrap(copy.title, body, DIR[details.lang]));
}
