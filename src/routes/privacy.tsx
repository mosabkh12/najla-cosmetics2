import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/api/settings/settings";
import { useI18n, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Najla Cosmetics" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["business_settings"],
      queryFn: () => getSettings(),
    });
  },
  component: PrivacyPage,
});

// This describes what the site actually does, not a generic template —
// keep it in sync with reality whenever a new data collection point,
// cookie, or third-party processor is added (see auth-middleware.ts,
// useCart.tsx, i18n.tsx for what's genuinely stored today, and
// email/mailer.ts + integrations/google/calendar.server.ts for the only
// two outside processors currently in use).
interface PolicySection {
  heading: string;
  body: string[];
}
interface PolicyContent {
  title: string;
  lastUpdated: string;
  intro: string[];
  sections: PolicySection[];
}

const CONTENT: Record<Lang, PolicyContent> = {
  he: {
    title: "מדיניות פרטיות ועוגיות",
    lastUpdated: "עודכן לאחרונה: יולי 2026",
    intro: [
      "מדיניות זו מסבירה אילו נתונים {business} (\"אנחנו\") אוספת ממך בעת השימוש באתר, כיצד אנו משתמשים בהם, ואילו עוגיות ואחסון מקומי (local storage) פועלים בדפדפן שלך — בדיוק כפי שהם מיושמים באתר הזה, ולא כרשימה כללית.",
    ],
    sections: [
      {
        heading: "1. מידע שאנו אוספים",
        body: [
          "בעת יצירת חשבון: שם מלא, כתובת אימייל וטלפון.",
          "בעת ביצוע הזמנת מוצרים: פרטי המשלוח, פרטי יצירת קשר, ורשימת הפריטים שהוזמנו.",
          "בעת קביעת תור: שם, טלפון, מועד ושעת התור, שם השירות, והערות שבחרת להוסיף.",
          "מוצרים ששמרת ב\"מועדפים\", והעדפת שפת התצוגה שלך (עברית/ערבית/אנגלית).",
          "אנו לא אוספים פרטי כרטיס אשראי ולא מעבדים תשלומים באתר עצמו.",
        ],
      },
      {
        heading: "2. עוגיות ואחסון מקומי — מה בפועל שמור בדפדפן שלך",
        body: [
          "האתר משתמש אך ורק באחסון מקומי (local storage) חיוני לתפעולו, ולא בעוגיות פרסום, מעקב או ניתוח סטטיסטי של צד שלישי:",
          "• אסימון ההתחברות שלך (session) — שומר אותך מחוברים בין ביקורים, מנוהל על ידי ספק האימות שלנו (Supabase).",
          "• תוכן עגלת הקניות שלך — נשמר במכשירך בלבד עד להשלמת ההזמנה.",
          "• שפת התצוגה המועדפת עליך.",
          "נכון להיום איננו משתמשים ב-Google Analytics, Facebook Pixel, או כל כלי מעקב/פרסום דומה. אם הדבר ישתנה בעתיד, מדיניות זו תעודכן בהתאם ותפורסם הודעה על כך.",
          "בבאנר העוגיות תוכלו לבחור בין \"אישור הכל\" לבין \"חיוניים בלבד\". שתי הבחירות מפעילות היום בדיוק את אותו אחסון חיוני שתואר לעיל — הבחירה נשמרת בדפדפן שלכם ותשמש לניהול כלים נוספים, אם וכאשר יתווספו בעתיד.",
          "ניתן למחוק מידע זה בכל עת דרך הגדרות הדפדפן — פעולה זו תנתק אותך מהחשבון ותרוקן את העגלה השמורה.",
        ],
      },
      {
        heading: "3. כיצד אנו משתמשים במידע",
        body: [
          "לביצוע ומעקב אחר הזמנות ותורים שביצעת, כולל שליחת אימייל אישור ועדכוני סטטוס.",
          "להתראה כאשר מוצר שסימנת כמועדף חוזר למלאי.",
          "לתקשורת שירות לקוחות ותמיכה בפניות שהעברת אלינו.",
          "לניהול חשבונך והעדפותיך (כולל שפת התצוגה).",
        ],
      },
      {
        heading: "4. גורמים חיצוניים המעבדים מידע עבורנו",
        body: [
          "Supabase — אחסון בסיס הנתונים, ניהול ההתחברות וחשבונות המשתמשים.",
          "Resend — שליחת הודעות אימייל תפעוליות (אישורי הזמנה, תזכורות תור, קודי אימות).",
          "Google Calendar — לצורך תיאום פנימי של יומן התורים על ידי הצוות שלנו בלבד; פרטי התור מסונכרנים אך אינם משותפים לגורם חיצוני נוסף.",
          "אנו לא מוכרים ואיננו משתפים את המידע שלך עם מפרסמים.",
        ],
      },
      {
        heading: "5. שמירת מידע",
        body: [
          "אנו שומרים את המידע שלך כל עוד חשבונך פעיל, ולפרק הזמן הנדרש למטרות שלשמן נאסף (כגון תיעוד הזמנות) או כנדרש על פי דין.",
        ],
      },
      {
        heading: "6. הזכויות שלך",
        body: [
          "בהתאם לחוק הגנת הפרטיות, התשמ\"א-1981, הנך רשאי לעיין במידע השמור אודותיך ולבקש לתקן מידע שאינו נכון, שלם או מדויק. ניתן לפנות אלינו בפרטי הקשר שבתחתית עמוד זה.",
        ],
      },
      {
        heading: "7. אבטחת מידע",
        body: [
          "אנו נוקטים אמצעי אבטחה מקובלים להגנה על המידע שלך, אולם לא ניתן להבטיח הגנה מוחלטת מפני כל פגיעה או שיבוש.",
        ],
      },
      {
        heading: "8. עדכוני מדיניות",
        body: [
          "מדיניות זו עשויה להתעדכן מעת לעת בהתאם לשינויים באתר או בדין. הגרסה המעודכנת תפורסם תמיד בעמוד זה.",
        ],
      },
      {
        heading: "9. יצירת קשר",
        body: [],
      },
    ],
  },
  ar: {
    title: "سياسة الخصوصية وملفات تعريف الارتباط",
    lastUpdated: "آخر تحديث: يوليو 2026",
    intro: [
      "توضح هذه السياسة ما هي البيانات التي تجمعها {business} (\"نحن\") عند استخدامك للموقع، وكيف نستخدمها، وما هي ملفات تعريف الارتباط والتخزين المحلي (local storage) الفعّالة فعليًا في متصفحك — وصفًا لما هو مطبّق في هذا الموقع تحديدًا، وليس قائمة عامة.",
    ],
    sections: [
      {
        heading: "1. المعلومات التي نجمعها",
        body: [
          "عند إنشاء حساب: الاسم الكامل، البريد الإلكتروني، ورقم الهاتف.",
          "عند تقديم طلب منتجات: تفاصيل التوصيل، معلومات التواصل، وقائمة العناصر المطلوبة.",
          "عند حجز موعد: الاسم، الهاتف، تاريخ ووقت الموعد، اسم الخدمة، وأي ملاحظات تختارين إضافتها.",
          "المنتجات التي أضفتها إلى \"المفضلة\"، ولغة العرض المفضلة لديك (عبرية/عربية/إنجليزية).",
          "نحن لا نجمع بيانات بطاقات الائتمان ولا نعالج المدفوعات داخل الموقع نفسه.",
        ],
      },
      {
        heading: "2. ملفات تعريف الارتباط والتخزين المحلي — ما المخزّن فعليًا في متصفحك",
        body: [
          "يستخدم الموقع فقط تخزينًا محليًا ضروريًا لتشغيله، وليس ملفات تعريف ارتباط إعلانية أو تتبعية أو تحليلية من طرف ثالث:",
          "• رمز تسجيل دخولك (الجلسة) — يبقيك مسجلاً بين الزيارات، ويُدار بواسطة مزوّد المصادقة لدينا (Supabase).",
          "• محتوى سلة التسوق الخاصة بك — يُحفظ على جهازك فقط حتى إتمام الطلب.",
          "• لغة العرض المفضلة لديك.",
          "لا نستخدم حاليًا Google Analytics أو Facebook Pixel أو أي أداة تتبع/إعلانات مشابهة. إذا تغيّر ذلك مستقبلاً، سيتم تحديث هذه السياسة والإعلان عن ذلك.",
          "في شريط ملفات تعريف الارتباط يمكنك الاختيار بين \"الموافقة على الكل\" و\"الضرورية فقط\". كلا الخيارين يفعّلان اليوم بالضبط نفس التخزين الضروري الموصوف أعلاه — يُحفظ اختيارك في متصفحك ليُستخدم لإدارة أي أدوات إضافية إن وجدت مستقبلاً.",
          "يمكنك حذف هذه البيانات في أي وقت من إعدادات المتصفح — سيؤدي ذلك إلى تسجيل خروجك وإفراغ السلة المحفوظة.",
        ],
      },
      {
        heading: "3. كيف نستخدم المعلومات",
        body: [
          "لتنفيذ ومتابعة الطلبات والمواعيد التي أجريتها، بما في ذلك إرسال بريد تأكيد وتحديثات الحالة.",
          "لإشعارك عند توفر منتج أضفته إلى المفضلة مجددًا في المخزون.",
          "للتواصل معك بخصوص خدمة العملاء والرد على استفساراتك.",
          "لإدارة حسابك وتفضيلاتك (بما في ذلك لغة العرض).",
        ],
      },
      {
        heading: "4. جهات خارجية تعالج البيانات نيابة عنا",
        body: [
          "Supabase — استضافة قاعدة البيانات، وإدارة تسجيل الدخول وحسابات المستخدمين.",
          "Resend — إرسال رسائل البريد الإلكتروني التشغيلية (تأكيد الطلب، تذكير بالموعد، رموز التحقق).",
          "Google Calendar — للتنسيق الداخلي لجدول المواعيد من قبل فريقنا فقط؛ تُزامَن تفاصيل الموعد ولا تُشارَك مع أي جهة خارجية إضافية.",
          "نحن لا نبيع ولا نشارك بياناتك مع المعلنين.",
        ],
      },
      {
        heading: "5. الاحتفاظ بالبيانات",
        body: [
          "نحتفظ ببياناتك طالما حسابك نشط، وللمدة اللازمة للأغراض التي جُمعت من أجلها (مثل توثيق الطلبات) أو وفقًا لما يقتضيه القانون.",
        ],
      },
      {
        heading: "6. حقوقك",
        body: [
          "وفقًا لقانون حماية الخصوصية الإسرائيلي لعام 1981، يحق لك الاطلاع على البيانات المحفوظة عنك وطلب تصحيح أي معلومات غير صحيحة أو ناقصة. يمكنك التواصل معنا عبر بيانات الاتصال أسفل هذه الصفحة.",
        ],
      },
      {
        heading: "7. أمن المعلومات",
        body: [
          "نتخذ إجراءات أمنية معقولة لحماية بياناتك، لكن لا يمكن ضمان حماية مطلقة من أي اختراق أو خلل.",
        ],
      },
      {
        heading: "8. تحديثات السياسة",
        body: [
          "قد تُحدَّث هذه السياسة من وقت لآخر وفقًا للتغييرات في الموقع أو القانون. ستُنشر النسخة المحدّثة دائمًا في هذه الصفحة.",
        ],
      },
      {
        heading: "9. التواصل معنا",
        body: [],
      },
    ],
  },
  en: {
    title: "Privacy & Cookie Policy",
    lastUpdated: "Last updated: July 2026",
    intro: [
      "This policy explains what data {business} (\"we\") collects when you use this site, how we use it, and exactly which cookies and local storage actually run in your browser — a description of what this specific site does, not a generic template.",
    ],
    sections: [
      {
        heading: "1. Information We Collect",
        body: [
          "When you create an account: your full name, email address, and phone number.",
          "When you place a product order: delivery details, contact information, and the list of items ordered.",
          "When you book an appointment: your name, phone number, the appointment date/time, the service name, and any notes you choose to add.",
          "Products you've saved as favorites, and your preferred display language (Hebrew/Arabic/English).",
          "We do not collect credit card details and do not process payments on the site itself.",
        ],
      },
      {
        heading: "2. Cookies & Local Storage — what's actually stored in your browser",
        body: [
          "This site only uses local storage that's essential to its operation — not advertising, tracking, or third-party analytics cookies:",
          "• Your sign-in session token — keeps you logged in between visits, managed by our authentication provider (Supabase).",
          "• Your shopping cart contents — kept on your device only until checkout is completed.",
          "• Your preferred display language.",
          "We do not currently use Google Analytics, Facebook Pixel, or any similar tracking/advertising tool. If that ever changes, this policy will be updated and the change announced.",
          "In the cookie banner you can choose between \"Accept All\" and \"Necessary Only.\" Both options currently enable exactly the same essential storage described above — your choice is saved in your browser and will be used to manage any additional tools if and when they're added in the future.",
          "You can clear this data at any time via your browser settings — doing so will sign you out and empty your saved cart.",
        ],
      },
      {
        heading: "3. How We Use Your Information",
        body: [
          "To fulfil and track the orders and appointments you make, including sending confirmation and status-update emails.",
          "To notify you when a product you favorited is back in stock.",
          "To communicate with you about customer service and respond to inquiries you send us.",
          "To manage your account and preferences (including display language).",
        ],
      },
      {
        heading: "4. Third Parties That Process Data On Our Behalf",
        body: [
          "Supabase — database hosting, and managing sign-in and user accounts.",
          "Resend — sending operational emails (order confirmations, appointment reminders, verification codes).",
          "Google Calendar — for our own team's internal appointment scheduling only; appointment details are synced there but are not shared with any further outside party.",
          "We do not sell or share your data with advertisers.",
        ],
      },
      {
        heading: "5. Data Retention",
        body: [
          "We retain your data for as long as your account is active, and for as long as needed for the purposes it was collected for (such as order records) or as required by law.",
        ],
      },
      {
        heading: "6. Your Rights",
        body: [
          "Under Israel's Privacy Protection Law, 1981, you may review the data we hold about you and request correction of information that is inaccurate or incomplete. You can reach us using the contact details at the bottom of this page.",
        ],
      },
      {
        heading: "7. Security",
        body: [
          "We take reasonable security measures to protect your data, though no method can guarantee absolute protection against every breach or disruption.",
        ],
      },
      {
        heading: "8. Policy Updates",
        body: [
          "This policy may be updated from time to time to reflect changes to the site or the law. The current version will always be published on this page.",
        ],
      },
      {
        heading: "9. Contact Us",
        body: [],
      },
    ],
  },
};

function PrivacyPage() {
  const { lang } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });

  const businessName = settings?.business_name || "Najla Cosmetics";
  const content = CONTENT[lang];
  const contact = [settings?.address, settings?.phone].filter(Boolean).join(" · ");

  return (
    <section className="min-h-screen bg-background">
      <div className="mx-auto max-w-[820px] px-5 py-16 sm:px-10 sm:py-20">
        <h1 className="font-display text-[28px] italic text-foreground sm:text-[34px]">
          {content.title}
        </h1>
        <p className="mt-2 text-[12px] text-muted-foreground">{content.lastUpdated}</p>

        <div className="mt-8 space-y-2">
          {content.intro.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-secondary-foreground">
              {p.replace("{business}", businessName)}
            </p>
          ))}
        </div>

        <div className="mt-10 space-y-8">
          {content.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-[16px] font-semibold text-foreground">{s.heading}</h2>
              <div className="mt-2.5 space-y-1.5">
                {s.body.map((p, i) => (
                  <p key={i} className="text-[14px] leading-relaxed text-secondary-foreground">
                    {p}
                  </p>
                ))}
                {s.body.length === 0 && (
                  <p className="text-[14px] leading-relaxed text-secondary-foreground">
                    {businessName}
                    {contact ? ` — ${contact}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
