import { sendMail } from "./mailer";
import { BRAND, escapeHtml, wrap } from "./appointment-emails";

interface BackInStockDetails {
  customerName: string;
  customerEmail: string;
  productName: string;
  productImageUrl: string | null;
}

// customerName comes from the customer's own profile (full_name), never
// HTML-escaped at the source — escaped here for the same reason as the
// appointment emails: without it, a crafted name could inject arbitrary
// HTML into an email sent from this server. productName is admin-entered,
// not customer-controlled, but escaped anyway since it's cheap and this
// email could in principle be triggered for any product.
export async function sendBackInStockEmail(details: BackInStockDetails) {
  const image = details.productImageUrl
    ? `<img src="${escapeHtml(details.productImageUrl)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:16px;" />`
    : "";

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">Hi <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">Good news — an item on your favorites list is back in stock and ready to order.</p>
    ${image}
    <p style="font-size:16px;font-weight:600;color:${BRAND.text};margin:0 0 20px;text-align:center;">${escapeHtml(details.productName)}</p>
    <div style="padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.accent};">Available Now</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `Najla Cosmetics — ${details.productName} is back in stock`,
    wrap("Back In Stock", body),
  );
}
