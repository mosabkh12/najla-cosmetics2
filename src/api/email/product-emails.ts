import { sendMail } from "./mailer";
import { BRAND, escapeHtml, wrap, type Lang } from "./appointment-emails";

interface BackInStockDetails {
  customerName: string;
  customerEmail: string;
  productName: string;
  productImageUrl: string | null;
  lang: Lang;
}

const DIR: Record<Lang, "rtl" | "ltr"> = { he: "rtl", ar: "rtl", en: "ltr" };

const BACK_IN_STOCK_COPY: Record<Lang, { title: string; intro: string; badge: string }> = {
  he: {
    title: "חזר למלאי",
    intro: "בשורה טובה — פריט מרשימת המועדפים שלך חזר למלאי וזמין להזמנה.",
    badge: "זמין עכשיו",
  },
  ar: {
    title: "متوفر مجدداً",
    intro: "خبر سار — أحد العناصر في قائمة المفضلة لديك أصبح متوفراً مجدداً وجاهزاً للطلب.",
    badge: "متاح الآن",
  },
  en: {
    title: "Back In Stock",
    intro: "Good news — an item on your favorites list is back in stock and ready to order.",
    badge: "Available Now",
  },
};

// customerName comes from the customer's own profile (full_name), never
// HTML-escaped at the source — escaped here for the same reason as the
// appointment emails: without it, a crafted name could inject arbitrary
// HTML into an email sent from this server. productName is admin-entered,
// not customer-controlled, but escaped anyway since it's cheap and this
// email could in principle be triggered for any product.
export async function sendBackInStockEmail(details: BackInStockDetails) {
  const copy = BACK_IN_STOCK_COPY[details.lang] ?? BACK_IN_STOCK_COPY.he;
  const greeting = details.lang === "ar" ? "مرحباً" : details.lang === "en" ? "Hi" : "שלום";

  const image = details.productImageUrl
    ? `<img src="${escapeHtml(details.productImageUrl)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:16px;" />`
    : "";

  const body = `
    <p style="font-size:14px;color:${BRAND.text};margin:0 0 20px;">${greeting} <strong>${escapeHtml(details.customerName)}</strong>,</p>
    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.6;">${copy.intro}</p>
    ${image}
    <p style="font-size:16px;font-weight:600;color:${BRAND.text};margin:0 0 20px;text-align:center;">${escapeHtml(details.productName)}</p>
    <div style="padding:14px 16px;background:${BRAND.bg};border-radius:10px;text-align:center;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.accent};">${copy.badge}</span>
    </div>`;

  await sendMail(
    details.customerEmail,
    `Najla Cosmetics — ${details.productName}`,
    wrap(copy.title, body, DIR[details.lang]),
  );
}
