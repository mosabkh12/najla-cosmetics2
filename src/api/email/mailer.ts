import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Missing RESEND_API_KEY env var");
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export async function sendMail(to: string, subject: string, html: string) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL env var");

  const fromName = process.env.SMTP_FROM_NAME || "Najla Cosmetics";

  const { error } = await getResend().emails.send({
    from: `${fromName} <${from}>`,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[sendMail] Resend send failed", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
}
