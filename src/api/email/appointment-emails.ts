import { sendMail } from "./mailer";

interface BookingDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
}

const BRAND = {
  bg: "#faf8f6",
  card: "#ffffff",
  text: "#1b1c1c",
  muted: "#615e57",
  accent: "#c4a882",
  border: "#ece8e3",
};

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 16px;font-size:13px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${label}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};text-align:end;">${value}</td>
  </tr>`;
}

function wrap(title: string, body: string) {
  return `<div style="background:${BRAND.bg};padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
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
  return `<table style="width:100%;border-collapse:collapse;">
    ${row("Service", d.serviceName)}
    ${row("Date", d.date)}
    ${row("Time", d.time.slice(0, 5))}
    ${row("Duration", `${d.duration} min`)}
    ${row("Price", `₪${d.price}`)}
  </table>`;
}

export async function sendBookingConfirmation(details: BookingDetails) {
  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">Hi <strong>${details.customerName}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">Your appointment has been received and is awaiting confirmation. We'll be in touch soon!</p>
    ${detailsTable(details)}
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.accent};">Status: Pending Confirmation</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    "Najla Cosmetics — Appointment Received",
    wrap("Appointment Confirmation", body),
  );
}

export async function sendAdminBookingNotification(details: BookingDetails) {
  const adminEmail = process.env.SMTP_USER;
  if (!adminEmail) return;

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">A new appointment has been booked:</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Customer", details.customerName)}
      ${row("Phone", details.customerPhone)}
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
}

export async function sendStatusUpdateEmail(details: StatusUpdateDetails) {
  const label = STATUS_LABELS[details.status];
  if (!label) return;

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">Hi <strong>${details.customerName}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">Your appointment status has been updated.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Service", details.serviceName)}
      ${row("Date", details.date)}
      ${row("Time", details.time.slice(0, 5))}
    </table>
    <div style="margin-top:20px;padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:${label.color};">${label.en} / ${label.he} / ${label.ar}</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `Najla Cosmetics — Appointment ${label.en}`,
    wrap("Appointment Update", body),
  );
}
