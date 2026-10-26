import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import Link from "next/link";
import ThemeToggle, { THEME_SCRIPT } from "@/components/ThemeToggle";
import JourneyChip from "@/components/journey/JourneyChip";
import AuthProvider from "@/components/auth/AuthProvider";
import AccountMenu from "@/components/auth/AccountMenu";
import ConsentBanner from "@/components/auth/ConsentBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Geopolitica", template: "%s | Geopolitica" },
  description:
    "The ripple effects of world events, explained in layers: what happened, who wins and loses, what it costs you, and what to do before it lands.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* applies the saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="inline-flex items-center gap-2 font-serif text-xl font-medium no-underline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/globe-96.png" alt="" width={30} height={30} className="rounded-md" />
              <span>Geopolitica <span className="hidden text-sm font-normal text-ink-2 xl:inline">· enterprise edition</span></span>
            </Link>
            {/* one scrolling row on a phone, so the header never eats the map */}
            <div className="order-3 flex w-full items-center gap-4 overflow-x-auto whitespace-nowrap text-[15px] sm:order-2 sm:ml-auto sm:w-auto sm:gap-4">
              <JourneyChip />
              <Link href="/events" className="no-underline hover:underline">
                Events
              </Link>
              <Link href="/dossiers" className="no-underline hover:underline">
                Dossiers
              </Link>
              <Link href="/changes" className="no-underline hover:underline">
                Change radar
              </Link>
              <Link href="/lanes" className="no-underline hover:underline">
                Lanes
              </Link>
              <Link
                href="/enterprise"
                className="rounded-sm bg-teal px-3 py-1.5 text-paper no-underline hover:opacity-90"
              >
                For your company
              </Link>
              <ThemeToggle />
            </div>
            <div className="order-2 whitespace-nowrap sm:order-3">
              <AccountMenu />
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-2 sm:px-6">
            <p>
              Every number links to its source. Forecasts are judgements and are graded as
              they resolve. Nothing here is investment or legal advice.
            </p>
            <span className="flex gap-4">
              {process.env.NEXT_PUBLIC_BUILD && process.env.NEXT_PUBLIC_BUILD !== "unknown" ? (
                <span className="text-ink-3" title="Deployed commit">build {process.env.NEXT_PUBLIC_BUILD.slice(0, 7)}</span>
              ) : null}
              <Link href="/method" className="hover:underline">
                How we work
              </Link>
              <Link href="/guide" className="hover:underline">
                How to use
              </Link>
              <Link href="/guide#privacy" className="hover:underline">
                Privacy
              </Link>
              <Link href="/welcome" className="hover:underline">
                What is Geopolitica?
              </Link>
              <a href="https://neel8636.github.io/Geopolitica/" className="hover:underline">
                Atlas, the personal edition
              </a>
            </span>
          </div>
        </footer>
        <ConsentBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
