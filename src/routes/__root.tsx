import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/sonner";
import { useKeepScrollbarVisibleForSelects } from "@/lib/keep-scrollbar-visible";

// Radix UI primitives (Select, RadioGroup, Dialog, etc.) don't inherit the
// document's dir="rtl" automatically — without this, they silently render
// LTR internals (item order, animations) regardless of the page language.
function RadixDirectionSync({ children }: { children: ReactNode }) {
  const { dir } = useI18n();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-6xl text-foreground">404</h1>
        <p className="mt-3 text-sm text-secondary-foreground">Page not found.</p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-md btn-gold px-4 py-2 text-sm"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-secondary-foreground">Please try again.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-5 rounded-md btn-gold px-4 py-2 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Najla Cosmetics — טיפולי יופי ומוצרים" },
      {
        name: "description",
        content: "Najla Cosmetics — טיפולי יופי מקצועיים ומוצרי קוסמטיקה נבחרים.",
      },
      { property: "og:title", content: "Najla Cosmetics — טיפולי יופי ומוצרים" },
      {
        property: "og:description",
        content: "Najla Cosmetics — טיפולי יופי מקצועיים ומוצרי קוסמטיקה נבחרים.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Najla Cosmetics — טיפולי יופי ומוצרים" },
      {
        name: "twitter:description",
        content: "Najla Cosmetics — טיפולי יופי מקצועיים ומוצרי קוסמטיקה נבחרים.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/300cc964-7800-4a67-ac68-c96cce87c586/id-preview-0315d698--c587dc59-acb7-400d-9e6d-48419d945913.lovable.app-1782510558358.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/300cc964-7800-4a67-ac68-c96cce87c586/id-preview-0315d698--c587dc59-acb7-400d-9e6d-48419d945913.lovable.app-1782510558358.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// WCAG 2.4.1 Bypass Blocks: a keyboard/screen-reader user landing on any
// page would otherwise have to tab through the entire header (logo, 5 nav
// links, language switcher, account, cart, book-now) before ever reaching
// page content — this jumps straight to <main>. Positioned off-screen
// until it receives focus (Tab from the very top of the page), matching
// the same sr-only/focus:not-sr-only pattern used for icon-only labels
// elsewhere, so it's invisible to everyone else.
function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[100] focus:rounded-full focus:bg-foreground focus:px-5 focus:py-2.5 focus:text-[12px] focus:font-semibold focus:text-background"
    >
      {t("skip_to_content")}
    </a>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useKeepScrollbarVisibleForSelects();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RadixDirectionSync>
          <AuthProvider>
            <CartProvider>
              <div className="flex min-h-screen flex-col">
                <SkipLink />
                <Header />
                {/* tabIndex=-1: not a normal tab stop, only a programmatic
                    focus target — the skip link above moves focus here so
                    a screen reader announces "main" and continues reading
                    from page content instead of restarting at the top. */}
                <main id="main-content" tabIndex={-1} className="flex-1 pt-20 focus:outline-none">
                  <Outlet />
                </main>
                <Footer />
                <Toaster position="top-center" />
              </div>
            </CartProvider>
          </AuthProvider>
        </RadixDirectionSync>
      </I18nProvider>
    </QueryClientProvider>
  );
}
