import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import Link from "next/link";
import ThemeToggle, { THEME_SCRIPT } from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
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
        <header className="relative border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-x-5 px-4 py-2 sm:flex-wrap sm:gap-y-2 sm:px-6 sm:py-3">
            <Link href="/" className="inline-flex min-w-0 items-center gap-2 font-serif text-lg font-medium no-underline sm:text-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/globe-96.png" alt="" width={28} height={28} className="rounded-md" />
              <span className="truncate">Geopolitica <span className="hidden text-sm font-normal text-ink-2 xl:inline">· enterprise edition</span></span>
            </Link>
            {/* desktop and tablet: the links in a row */}
            <div className="hidden items-center gap-4 whitespace-nowrap text-[15px] sm:ml-auto sm:flex">
              <JourneyChip />
              <Link href="/events" className="no-underline hover:underline">Events</Link>
              <Link href="/dossiers" className="no-underline hover:underline">Dossiers</Link>
              <Link href="/changes" className="no-underline hover:underline">Change radar</Link>
              <Link href="/lanes" className="no-underline hover:underline">Lanes</Link>
              <Link href="/enterprise" className="rounded-sm bg-teal px-3 py-1.5 text-paper no-underline hover:opacity-90">For your company</Link>
              <ThemeToggle />
            </div>
            <div className="hidden whitespace-nowrap sm:block">
              <AccountMenu />
            </div>
            {/* phone: one short row, everything else behind the menu button */}
            <MobileNav>
              <div className="flex flex-col text-[16px]">
                <span className="border-b border-line py-3 empty:hidden"><JourneyChip /></span>
                <Link href="/events" className="border-b border-line py-3 no-underline">Events</Link>
                <Link href="/dossiers" className="border-b border-line py-3 no-underline">Dossiers</Link>
                <Link href="/changes" className="border-b border-line py-3 no-underline">Change radar</Link>
                <Link href="/lanes" className="border-b border-line py-3 no-underline">Lanes</Link>
                <Link href="/enterprise" className="mt-3 rounded-md bg-teal px-3 py-2.5 text-center text-paper no-underline">For your company</Link>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <AccountMenu />
                <ThemeToggle />
              </div>
            </MobileNav>
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
