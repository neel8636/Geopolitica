import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import Link from "next/link";
import ThemeToggle, { THEME_SCRIPT } from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import AuthProvider from "@/components/auth/AuthProvider";
import AccountMenu from "@/components/auth/AccountMenu";
import ConsentBanner from "@/components/auth/ConsentBanner";
import RippleProvider from "@/components/ripple/RippleProvider";
import FollowProvider from "@/components/tracker/FollowProvider";
import AskProvider from "@/components/ask/AskProvider";
import Spotlight, { ReplayTour } from "@/components/tour/Spotlight";
import TrackerLink from "@/components/tracker/TrackerLink";
import LiveUpdates from "@/components/ripple/LiveUpdates";
import { loadWire } from "@/content/wire";
import { todaysRipples } from "@/content/ripples";
import { SITE_NAME, SITE_ORIGIN, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "Geopolitica Atlas: how world events connect", template: "%s | Geopolitica Atlas" },
  description: TAGLINE,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: { type: "website", siteName: SITE_NAME, title: "Geopolitica Atlas: how world events connect", description: TAGLINE, url: `${SITE_URL}/`, images: [{ url: `${SITE_URL}/share/atlas.png`, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Geopolitica Atlas: how world events connect", description: TAGLINE, images: [`${SITE_URL}/share/atlas.png`] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const wire = loadWire();
  const today = todaysRipples().map((r) => r.id);
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* applies the saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
        <AskProvider>
        <FollowProvider>
        <RippleProvider>
        <header className="relative border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-x-5 px-4 py-2 sm:flex-wrap sm:gap-y-2 sm:px-6 sm:py-3">
            <Link href="/" className="inline-flex min-w-0 items-center gap-2 font-serif text-lg font-medium no-underline sm:text-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/globe-96.png`} alt="" width={28} height={28} className="rounded-md" />
              <span className="truncate">Geopolitica <span className="text-ink-2">Atlas</span></span>
            </Link>
            {/* desktop and tablet: the links in a row */}
            <div className="hidden items-center gap-5 whitespace-nowrap text-[15px] sm:ml-auto sm:flex">
              <Link href="/" className="no-underline hover:underline">Map</Link>
              <Link href="/events" className="no-underline hover:underline">Events</Link>
              <Link href="/drivers" data-spotlight="drivers" className="no-underline hover:underline">Drivers</Link>
              <TrackerLink />
              <Link href="/guide" className="no-underline hover:underline">How to use</Link>
              <ThemeToggle />
            </div>
            <div className="hidden whitespace-nowrap sm:block">
              <AccountMenu />
            </div>
            {/* phone: one short row, everything else behind the menu button */}
            <MobileNav>
              <div className="flex flex-col text-[16px]">
                <Link href="/" className="border-b border-line py-3 no-underline">Map</Link>
                <Link href="/events" className="border-b border-line py-3 no-underline">Events</Link>
                <Link href="/drivers" className="border-b border-line py-3 no-underline">Drivers</Link>
                <span className="border-b border-line py-3"><TrackerLink /></span>
                <Link href="/guide" className="border-b border-line py-3 no-underline">How to use</Link>
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
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-ink-2 sm:px-6">
            <p>Free for anyone learning geopolitics. Every event links to its sources; connections carry the sentence that justifies them.</p>
            <span className="flex gap-4">
              <Link href="/guide#method" className="hover:underline">How reports are made</Link>
              <Link href="/guide#privacy" className="hover:underline">Privacy</Link>
              <Link href="/welcome" className="hover:underline">What is Geopolitica?</Link>
              <ReplayTour />
              <a href="https://geopolitica-1rja.onrender.com" className="hover:underline">Enterprise edition</a>
            </span>
          </div>
        </footer>
        <ConsentBanner />
        <LiveUpdates version={wire.fetchedAt} today={today} />
        <Spotlight />
        </RippleProvider>
        </FollowProvider>
        </AskProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
