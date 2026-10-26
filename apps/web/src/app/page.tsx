import Link from "next/link";
import { EVENTS } from "@/content/events";
import type { FuelLite } from "@/components/mapfirst/MapFirst";
import WebMapHome from "@/components/mapfirst/WebMapHome";
import IntroGate from "@/components/intro/IntroGate";
import { liveCards, liveToday } from "@/lib/live";

/*
  Map first, as in the Atlas: the front page is the map, fed by the Atlas's live layer
  (what is fueling each event, how fast its news moves, today's picks). The enterprise doors
  sit in the panel's Tools tab; /start lays them out in full. Supply-chain views come later.
*/
const TOOLS = [
  { href: "/guide", title: "How to use", body: "Reading the map, moving around on a computer or phone, building reports." },
  { href: "/start", title: "Start here", body: "What the enterprise edition does, in one page." },
  { href: "/get-started", title: "Get started", body: "Six steps, about half an hour, ending with your own supplier list." },
  { href: "/dossiers", title: "Dossiers", body: "Each event as a layered report you can read at your depth." },
  { href: "/lanes", title: "Lanes", body: "Your routes by sea, road, air or rail: which costs more once today's events are counted, and what to do." },
  { href: "/changes", title: "Change radar", body: "Dated regulations, tariffs and strikes, sorted by when they bite." },
  { href: "/enterprise", title: "Company impact report", body: "Your suppliers, parts, lanes and sites: a brief for every department." },
];

export default async function Home() {
  const [cards, todayIds] = await Promise.all([liveCards(), liveToday()]);
  const fuel: Record<string, FuelLite[]> = {};
  const pulse: Record<string, { trend: string; day: number }> = {};
  for (const e of EVENTS) {
    const c = cards[e.id];
    fuel[e.id] = (c?.fuel?.items ?? []).map((f) => ({ title: f.title, aspect: f.aspect, via: f.via, place: f.place }));
    if (c) pulse[e.id] = { trend: c.pulse.trend, day: c.pulse.day };
  }
  const ids = todayIds.length
    ? todayIds
    : [...EVENTS].sort((a, b) => (cards[b.id]?.pulse.day ?? 0) - (cards[a.id]?.pulse.day ?? 0)).slice(0, 5).map((e) => e.id);
  const today = ids.filter((id) => EVENTS.some((e) => e.id === id)).map((id) => ({ id, headline: cards[id]?.headline ?? EVENTS.find((e) => e.id === id)!.summary }));
  const tools = (
    <div>
      <p className="mb-2 text-[13px] text-ink-2">The enterprise edition: the same map, and tools for running it on your company.</p>
      {TOOLS.map((t) => (
        <Link key={t.href} href={t.href} className="mb-1.5 block rounded-lg border border-line px-3 py-2.5 no-underline hover:border-gold">
          <span className="block text-[14px] font-medium">{t.title} →</span>
          <span className="block text-xs text-ink-3">{t.body}</span>
        </Link>
      ))}
    </div>
  );
  return (
    <>
      <IntroGate />
      <h1 className="sr-only">Geopolitica: every ripple of every event, down to your supply chain</h1>
      <WebMapHome fuel={fuel} pulse={pulse} today={today} tools={tools} />
    </>
  );
}
