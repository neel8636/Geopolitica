import Link from "next/link";
import { listDossiers, formatDate } from "@/content/dossiers";
import { ImpactMeter } from "@/components/dossier/Primitives";
import UpcomingChanges from "@/components/UpcomingChanges";

export const metadata = { title: "Start here" };

/*
  The doors into the enterprise edition (the map is the front page now; these are its Tools
  tab, written out in full). Not a lead story. Readers pick where to start:
  an event report, the calendar of what is coming, or their own supply chain.
  Nothing here is pinned to one event; the lists below move as content does.
*/
const DOORS = [
  {
    href: "/get-started",
    kicker: "New here",
    title: "Get started",
    body: "Six steps, about half an hour: what Geopolitica does, one event report, the change radar, a sample company, then your own supplier list.",
    cta: "Begin the journey",
    primary: true,
  },
  {
    href: "/dossiers",
    kicker: "Read an event",
    title: "Dossiers",
    body: "Each event as a layered report: a 30-second card, a 5-minute brief, deep-dive modules, and every source. Pick the one you care about.",
    cta: "Browse the dossiers",
  },
  {
    href: "/changes",
    kicker: "See what is coming",
    title: "Change radar",
    body: "Dated regulations, tariffs, strikes and developing situations, sorted by when they bite. Updated as the calendar moves.",
    cta: "Open the radar",
  },
  {
    href: "/lanes",
    kicker: "Check your routes",
    title: "Lanes",
    body: "Pick a lane by sea, road, air or rail. Every standard route is checked against today's events: chance of disruption, expected delay and cost, and what to do.",
    cta: "Compare routes",
  },
  {
    href: "/enterprise",
    kicker: "Run it on your company",
    title: "Company impact report",
    body: "Share your suppliers, parts, lanes and sites. Every department gets its own brief: what changes, when, your exposure, next action.",
    cta: "Start a report",
  },
];

export default function Start() {
  const dossiers = listDossiers();
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="py-12 lg:py-16">
        <p className="signpost">Geopolitica</p>
        <h1 className="mt-2 max-w-3xl text-[2.5rem] leading-[1.08] sm:text-[3.25rem]">
          Every ripple of every event, down to your supply chain.
        </h1>
        <p className="prose-dossier mt-5 text-ink-2">
          Geopolitica follows world events to their consequences: who wins and loses, what it
          costs, what to do before it lands. Read one event, watch the calendar, or run the
          engine on your own supply chain.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {DOORS.map((d) => (
            <Link key={d.href} href={d.href} className={`group flex flex-col rounded-lg border p-5 no-underline hover:border-teal ${"primary" in d && d.primary ? "border-teal bg-teal-2" : "border-line bg-paper-2"}`}>
              <p className="signpost">{d.kicker}</p>
              <p className="mt-2 font-serif text-2xl">{d.title}</p>
              <p className="mt-2 flex-1 text-[15px] text-ink-2">{d.body}</p>
              <p className="mt-4 text-[15px] text-teal group-hover:underline">{d.cta} →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-10 border-t border-line py-10 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">On the radar next</h2>
            <Link href="/changes" className="text-sm hover:underline">Full calendar</Link>
          </div>
          <div className="mt-4"><UpcomingChanges /></div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">Dossiers</h2>
            <Link href="/dossiers" className="text-sm hover:underline">All dossiers</Link>
          </div>
          <ul className="mt-4 divide-y divide-line-2 border-t border-line">
            {dossiers.map((d) => (
              <li key={d.slug} className="py-4">
                <Link href={`/dossiers/${d.slug}`} className="no-underline">
                  <p className="text-sm text-ink-2">
                    {d.region} · {d.status === "developing" ? "Developing" : "Stable"} · updated {formatDate(d.updated)}
                  </p>
                  <p className="mt-1 font-serif text-xl hover:underline">{d.title}</p>
                  <p className="mt-1 max-w-prose text-[15px] text-ink-2">{d.deck}</p>
                </Link>
                <div className="mt-2"><ImpactMeter level={d.card.impactMeter} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-2">
            New dossiers are added as events develop; the change radar carries everything dated before a dossier exists.
          </p>
        </div>
      </section>

      <section className="border-t border-line py-10">
        <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
          <h2 className="text-2xl">How a dossier works</h2>
          <div className="grid gap-6 text-[15px] sm:grid-cols-2">
            <div>
              <p className="font-medium">Four layers, your choice of depth</p>
              <p className="mt-1 text-ink-2">A 30-second card, a 5-minute brief with the same signposts every time, deep-dive modules you open only if you need them, and an evidence layer with every source and a confidence label on each claim.</p>
            </div>
            <div>
              <p className="font-medium">Predict, then read</p>
              <p className="mt-1 text-ink-2">Before the scenarios, you make a call. Then you see ours. Committing to a guess sharpens attention and memory.</p>
            </div>
            <div>
              <p className="font-medium">Forecasts on the record</p>
              <p className="mt-1 text-ink-2">Every probability and prediction is dated and graded publicly once the event resolves. Misses stay visible.</p>
            </div>
            <div>
              <p className="font-medium">Built for your company</p>
              <p className="mt-1 text-ink-2">Share your supplier list and the same engine tells each department which coming changes hit it, when, and what to do first.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
