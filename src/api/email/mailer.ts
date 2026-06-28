import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!_transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) throw new Error("Missing SMTP env vars");
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return _transporter;
}

export async function sendMail(to: string, subject: string, html: string) {
  const from = `"Najla Cosmetics" <${process.env.SMTP_USER}>`;
  await getTransporter().sendMail({ from, to, subject, html });
}
