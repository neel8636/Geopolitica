"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ArrowLeftRight, Bookmark, Plane, Ship, TrainFront, Truck, X } from "lucide-react";
import { MODES, MODE_LABEL, PLACE_BY_ID, POINT_BY_ID, laneFor, placesFor, type Mode } from "@/content/lanes";
import { RISK_LABEL, assessLane, type LaneInputs, type RouteAssessment } from "@/content/laneRisk";
import type { LaneFeed } from "@/content/laneTags";
import LaneMap, { LEVEL_COLOR } from "./LaneMap";

/*
  The Lanes page: pick how the goods move, where from and where to; put in what a shipment costs
  you; see every standard route between the two with today's events on it, which one costs more
  once those events are counted, and what to do. All of it runs here in the browser from the
  route library and the hourly event checks (lanes.json); nothing the customer types leaves the page.
*/

const ICON: Record<Mode, typeof Ship> = { sea: Ship, road: Truck, air: Plane, rail: TrainFront };
const DEFAULT_LANE: Record<Mode, [string, string]> = {
  sea: ["sea:SHANGHAI", "sea:NYNJ"],
  road: ["road:MONTERREY", "road:CHICAGO"],
  air: ["air:PVG", "air:ORD"],
  rail: ["rail:MONTERREY", "rail:CHICAGO"],
};
// starting values so the page shows something; the customer's own replace them
const EXAMPLE: Record<Mode, { shipments: number; freight: number; value: number; lateDay: number; unit: string }> = {
  sea: { shipments: 52, freight: 4000, value: 80000, lateDay: 250, unit: "container" },
  road: { shipments: 250, freight: 3500, value: 60000, lateDay: 400, unit: "truckload" },
  air: { shipments: 24, freight: 30000, value: 250000, lateDay: 1500, unit: "shipment" },
  rail: { shipments: 52, freight: 6000, value: 80000, lateDay: 250, unit: "container" },
};
const STORE = "geopolitica.lanes.v1";

interface Saved {
  origin: string;
  destination: string;
  shipments: number;
  freight: number;
  value: number;
  lateDay: number;
  carry: number;
  current?: string;
}

const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const d1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US");
const range = ([a, b]: [number, number], unit: string) => (a === b ? `${a}${unit}` : `${a}–${b}${unit}`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* A fixed UTC time, the same on the server and in the browser. */
function when(iso: string | null): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return "not yet";
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

// Saved lanes live in this browser's storage, read without a hydration mismatch.
const savedListeners = new Set<() => void>();
let savedCache: { raw: string | null; list: Saved[] } = { raw: null, list: [] };
const NONE: Saved[] = [];
function subscribeSaved(cb: () => void) {
  savedListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    savedListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readSaved(): Saved[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE);
  } catch {}
  if (raw !== savedCache.raw) {
    let list: Saved[] = [];
    try {
      const v = JSON.parse(raw ?? "[]");
      list = Array.isArray(v) ? v.filter((s) => PLACE_BY_ID[s?.origin] && PLACE_BY_ID[s?.destination]) : [];
    } catch {}
    savedCache = { raw, list };
  }
  return savedCache.list;
}
function writeSaved(list: Saved[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 20)));
  } catch {}
  savedListeners.forEach((f) => f());
}

// The lane lives in the address (#lane=sea:SHANGHAI~sea:NYNJ), so a link opens it.
const laneListeners = new Set<() => void>();
function subscribeLane(cb: () => void) {
  laneListeners.add(cb);
  window.addEventListener("hashchange", cb);
  return () => {
    laneListeners.delete(cb);
    window.removeEventListener("hashchange", cb);
  };
}
const readHash = () => window.location.hash;
function parseLane(hash: string): [string, string] | null {
  const m = /lane=([^&]+)~([^&]+)/.exec(decodeURIComponent(hash));
  const o = m && PLACE_BY_ID[m[1]];
  const d = m && PLACE_BY_ID[m[2]];
  return o && d && o.mode === d.mode && o.id !== d.id ? [o.id, d.id] : null;
}
function writeLane(origin: string, destination: string) {
  window.history.replaceState(null, "", `#lane=${origin}~${destination}`);
  laneListeners.forEach((f) => f());
}

function Num({ label, value, onChange, prefix, suffix, hint, min = 0, step = 1 }: { label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; hint?: string; min?: number; step?: number }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-2">{label}</span>
      <span className="mt-1 flex items-center rounded-md border border-line bg-paper px-2.5 focus-within:border-gold">
        {prefix ? <span className="text-ink-3">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full min-w-0 bg-transparent px-1 py-2 text-[15px] outline-none"
        />
        {suffix ? <span className="whitespace-nowrap text-sm text-ink-3">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

function Pill({ a }: { a: RouteAssessment }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-medium" style={{ borderColor: LEVEL_COLOR[a.level], color: LEVEL_COLOR[a.level] }}>
      {a.level !== "low" ? <AlertTriangle size={14} aria-hidden /> : null}
      {RISK_LABEL[a.level]} · {pct(a.chance)} chance of disruption
    </span>
  );
}

function RouteCard({
  a,
  n,
  isCurrent,
  isCheapest,
  isSafest,
  selected,
  onSelect,
  onCurrent,
  onFreight,
  onDays,
  unit,
}: {
  a: RouteAssessment;
  n: number;
  isCurrent: boolean;
  isCheapest: boolean;
  isSafest: boolean;
  selected: boolean;
  onSelect: () => void;
  onCurrent: () => void;
  onFreight: (v: number) => void;
  onDays: (v: number) => void;
  unit: string;
}) {
  const hitPoints = new Set(a.hits.map((h) => h.point));
  // the lane's own two ends are in the title already; ports and hubs in between stay (Los Angeles on a rail route)
  const ends = (i: number, n: number) => i === 0 || i === n - 1;
  const chain = a.route.points
    .map((p) => POINT_BY_ID[p])
    .filter((p, i, all) => p && !((p.kind === "port" || p.kind === "airport") && ends(i, all.length)));
  return (
    <article
      onClick={onSelect}
      className={`rounded-lg border bg-paper p-4 sm:p-5 ${selected ? "border-gold shadow-[var(--shadow)]" : "border-line"}`}
      style={{ borderLeftWidth: 5, borderLeftColor: LEVEL_COLOR[a.level] }}
      aria-label={`Route ${n}: ${a.route.label}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line font-sans text-[13px] font-semibold">{n}</span>
            {a.route.label}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill a={a} />
            {isCheapest ? <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[13px] font-medium text-ink">Cheapest expected</span> : null}
            {isSafest && !isCheapest ? <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[13px] font-medium text-ink">Lowest risk</span> : null}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <input type="radio" name="current-route" checked={isCurrent} onChange={onCurrent} className="accent-[var(--gold)]" />
          {isCurrent ? <b>Your route today</b> : "I use this route"}
        </label>
      </div>

      {chain.length ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          {chain.map((p, i) => (
            <span key={p.id}>
              {i ? " → " : ""}
              <span className={hitPoints.has(p.id) ? "font-semibold text-ink" : undefined}>{p.name}</span>
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5" onClick={(e) => e.stopPropagation()}>
        <Num label="Transit" value={a.days} onChange={onDays} suffix="days" step={0.5} />
        <Num label={`Freight per ${unit}`} value={Math.round(a.freight)} onChange={onFreight} prefix="$" hint={a.freightIsEstimate ? "Our estimate: enter your quote" : undefined} step={50} />
        <div>
          <span className="block text-[13px] font-medium text-ink-2">Expected delay</span>
          <span className="mt-1 block py-2 text-[15px]">{a.expDelay ? `${d1(a.expDelay)} days` : "None"}</span>
        </div>
        <div>
          <span className="block text-[13px] font-medium text-ink-2">Extra cost from events</span>
          <span className="mt-1 block py-2 text-[15px]">{money(a.expExtra)} <span className="text-ink-3">/ {unit}</span></span>
        </div>
        <div>
          <span className="block text-[13px] font-medium text-ink-2">Expected cost a year</span>
          <span className="mt-1 block py-2 text-[17px] font-semibold">{money(a.perYear)}</span>
        </div>
      </div>

      {a.hits.length ? (
        <ul className="mt-4 space-y-3 border-t border-line pt-4">
          {a.hits.map((h) => (
            <li key={h.event.id} className="text-[14px]">
              <p>
                <Link href={`/events/${h.event.id}`} className="font-medium underline" onClick={(e) => e.stopPropagation()}>
                  {h.event.title}
                </Link>
                <span className="text-ink-3"> · at {h.pointName} · {h.effectLabel}</span>
              </p>
              <p className="mt-0.5 text-ink-2">{h.why}</p>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {pct(h.likelihood)} likely in the next 30 days · if it happens: +{range(h.delayDays, " days")}
                {h.costPct[1] > 0 ? `, +${range(h.costPct, "%")} on freight` : ""}
                {h.headlines.length ? " · " : ""}
                {h.headlines.slice(0, 2).map((s, i) => (
                  <span key={s.url}>
                    {i ? ", " : ""}
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{s.publisher || "source"}</a>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-[14px] text-ink-3">No event on the map touches this route right now.</p>
      )}
      {a.route.notes.length ? (
        <ul className="mt-3 space-y-1 text-[13px] text-ink-3">
          {a.route.notes.map((t) => <li key={t}>Good to know: {t}</li>)}
        </ul>
      ) : null}
    </article>
  );
}

export default function LanePlanner({ feed }: { feed: LaneFeed }) {
  const hash = useSyncExternalStore(subscribeLane, readHash, () => "");
  const [origin, destination] = parseLane(hash) ?? DEFAULT_LANE.sea;
  const mode = PLACE_BY_ID[origin].mode;
  // until the customer types a figure, the example values follow the mode
  const [own, setOwn] = useState<{ shipments: number; freight: number; value: number; lateDay: number; carry: number } | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [ownFreight, setOwnFreight] = useState<Record<string, number>>({});
  const [ownDays, setOwnDays] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const saved = useSyncExternalStore(subscribeSaved, readSaved, () => NONE);

  const lane = useMemo(() => laneFor(origin, destination), [origin, destination]);
  const routes = useMemo(() => lane?.routes ?? [], [lane]);
  const currentId = routes.some((r) => r.id === current) ? current : routes[0]?.id ?? "";

  const ex = EXAMPLE[mode];
  const touched = own !== null;
  const { shipments, freight, value, lateDay, carry } = own ?? { shipments: ex.shipments, freight: ex.freight, value: ex.value, lateDay: ex.lateDay, carry: 20 };
  const setField = (k: "shipments" | "freight" | "value" | "lateDay" | "carry") => (v: number) =>
    setOwn((o) => ({ ...(o ?? { shipments, freight, value, lateDay, carry }), [k]: v }));
  const inputs: LaneInputs = { shipmentsPerYear: shipments, baseFreight: freight, cargoValue: value, carryRatePct: carry, lateDayCost: lateDay, current: currentId, freight: ownFreight, days: ownDays };
  const result = useMemo(() => assessLane(routes, feed, inputs), [routes, feed, shipments, freight, value, carry, lateDay, currentId, ownFreight, ownDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const places = useMemo(() => placesFor(mode), [mode]);
  const unit = ex.unit;
  const o = PLACE_BY_ID[origin];
  const d = PLACE_BY_ID[destination];

  const resetRoutes = () => {
    setCurrent("");
    setOwnFreight({});
    setOwnDays({});
    setSelected(null);
  };
  const pickMode = (m: Mode) => {
    writeLane(DEFAULT_LANE[m][0], DEFAULT_LANE[m][1]);
    // a figure typed for one mode means nothing for another
    if (m !== mode) setOwn(null);
    resetRoutes();
  };
  const save = () => {
    const entry: Saved = { origin, destination, shipments, freight, value, lateDay, carry, current: currentId };
    writeSaved([entry, ...saved.filter((s) => !(s.origin === origin && s.destination === destination))]);
  };
  const open = (s: Saved) => {
    writeLane(s.origin, s.destination);
    setOwn({ shipments: s.shipments, freight: s.freight, value: s.value, lateDay: s.lateDay, carry: s.carry });
    setOwnFreight({});
    setOwnDays({});
    setSelected(null);
    setCurrent(s.current ?? "");
  };
  const forget = (s: Saved) => {
    writeSaved(saved.filter((x) => x !== s));
  };

  const { current: cur, cheapest, safest, savingPerYear } = result;
  const anyHits = result.routes.some((a) => a.hits.length);

  return (
    <div className="space-y-8">
      {/* the lane */}
      <section className="rounded-lg border border-line bg-paper-2 p-4 sm:p-6" aria-label="Your lane">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="How the goods move">
          {MODES.map((m) => {
            const Icon = ICON[m];
            return (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => pickMode(m)}
                className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium ${mode === m ? "border-gold bg-paper text-ink" : "border-line text-ink-2 hover:border-gold"}`}
              >
                <Icon size={16} aria-hidden /> {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-2">From</span>
            <select value={origin} onChange={(e) => { writeLane(e.target.value, destination); resetRoutes(); }} className="mt-1 w-full rounded-md border border-line bg-paper px-2.5 py-2 text-[15px]">
              {places.map((p) => <option key={p.id} value={p.id} disabled={p.id === destination}>{p.name} ({p.country})</option>)}
            </select>
          </label>
          <button
            onClick={() => { writeLane(destination, origin); resetRoutes(); }}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-gold"
            aria-label="Swap from and to"
          >
            <ArrowLeftRight size={16} aria-hidden /> <span className="sm:hidden">Swap</span>
          </button>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-2">To</span>
            <select value={destination} onChange={(e) => { writeLane(origin, e.target.value); resetRoutes(); }} className="mt-1 w-full rounded-md border border-line bg-paper px-2.5 py-2 text-[15px]">
              {places.map((p) => <option key={p.id} value={p.id} disabled={p.id === origin}>{p.name} ({p.country})</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Num label="Shipments a year" value={shipments} onChange={setField("shipments")} suffix={`${unit}s`} />
          <Num label={`Freight per ${unit}, your route`} value={freight} onChange={setField("freight")} prefix="$" step={50} />
          <Num label={`Value of goods per ${unit}`} value={value} onChange={setField("value")} prefix="$" step={1000} />
          <Num label="Cost of one day late" value={lateDay} onChange={setField("lateDay")} prefix="$" hint="Expediting, overtime, line-stop risk" step={100} />
          <Num label="Inventory carrying cost" value={carry} onChange={setField("carry")} suffix="% a year" step={1} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          {!touched ? <span className="rounded bg-paper px-2 py-0.5 font-medium text-ink-2">Example values: put in your own</span> : null}
          <button onClick={save} className="inline-flex items-center gap-1.5 font-medium text-ink underline">
            <Bookmark size={14} aria-hidden /> Save this lane
          </button>
          <span>Saved lanes stay in this browser only.</span>
        </div>
        {saved.length ? (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Your saved lanes">
            {saved.map((s) => (
              <span key={`${s.origin}~${s.destination}`} className="inline-flex items-center rounded-full border border-line bg-paper text-[13px]">
                <button onClick={() => open(s)} className="py-1 pl-3 pr-1.5 hover:underline">
                  {MODE_LABEL[PLACE_BY_ID[s.origin].mode]}: {PLACE_BY_ID[s.origin].name} → {PLACE_BY_ID[s.destination].name}
                </button>
                <button onClick={() => forget(s)} className="py-1 pl-1 pr-2.5 text-ink-3 hover:text-ink" aria-label="Remove this saved lane">
                  <X size={13} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {!routes.length ? (
        <p className="rounded-lg border border-line p-5 text-[15px]">
          No standard {MODE_LABEL[mode].toLowerCase()} routes between {o?.name} and {d?.name} in the library yet.
          {mode === "road" ? " Road routes cover US–Mexico, US–Canada and the main European borders, so both places need to sit on either side of one of them." : ""}
          {mode === "rail" ? " Rail routes cover China–Europe and North America (within a country, or across the US–Mexico or US–Canada border)." : ""}
        </p>
      ) : (
        <>
          {/* the answer */}
          <section aria-label="The answer" className="rounded-lg border-2 border-gold/50 bg-paper p-4 sm:p-6">
            <p className="signpost">Once today’s events are counted</p>
            {cheapest && cur && cheapest !== cur && savingPerYear > cur.perYear * 0.03 ? (
              <p className="mt-2 font-serif text-2xl leading-snug">
                <b>{cheapest.route.label}</b> is the cheaper route: about <b>{money(savingPerYear)} a year</b> less in expected cost than your route ({cur.route.label}).
              </p>
            ) : cur ? (
              <p className="mt-2 font-serif text-2xl leading-snug">
                Your route, <b>{cur.route.label}</b>, is still the cheapest
                {cur.level === "low" ? "." : <>, but it carries a <b>{pct(cur.chance)} chance of disruption</b> in the next 30 days.</>}
              </p>
            ) : null}
            {cur ? (
              <p className="mt-2 text-[15px] text-ink-2">
                Your route: {pct(cur.chance)} chance of disruption, {cur.expDelay ? `${d1(cur.expDelay)} days of expected delay a shipment` : "no expected delay"}, {money(cur.extraPerYear)} a year of expected extra cost.
                {safest && safest !== cur && safest !== cheapest ? ` Lowest risk: ${safest.route.label} (${pct(safest.chance)}).` : ""}
              </p>
            ) : null}
            <p className="mt-3 text-[13px] text-ink-3">
              {feed.checked
                ? `${feed.checked} events on the map checked against these routes, last on ${when(feed.at)}.${anyHits ? "" : " None of them touches these routes today."}`
                : "The hourly check of events against routes has not run yet; routes, transit times and costs are shown without event risk."}
            </p>
          </section>

          {/* map and what to do */}
          <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div>
              {o && d ? <LaneMap routes={result.routes} origin={o} destination={d} selected={selected} onSelect={setSelected} /> : null}
              <p className="mt-2 text-[13px] text-ink-3">
                Line colour and pattern show the risk: solid green low, dashed amber medium, dotted red high. Numbers match the routes below; circles mark points events are hitting.
              </p>
            </div>
            <div>
              <h2 className="text-2xl">What to do</h2>
              <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[15px]">
                {result.actions.map((t) => <li key={t}>{t}</li>)}
              </ol>
            </div>
          </section>

          {/* every route */}
          <section aria-label="Routes compared">
            <h2 className="text-2xl">The routes, side by side</h2>
            <div className="mt-4 space-y-4">
              {result.routes.map((a, i) => (
                <RouteCard
                  key={a.route.id}
                  a={a}
                  n={i + 1}
                  unit={unit}
                  isCurrent={a.route.id === currentId}
                  isCheapest={a === cheapest}
                  isSafest={a === safest}
                  selected={selected === a.route.id}
                  onSelect={() => setSelected(a.route.id)}
                  onCurrent={() => setCurrent(a.route.id)}
                  onFreight={(v) => setOwnFreight((f) => ({ ...f, [a.route.id]: v }))}
                  onDays={(v) => setOwnDays((f) => ({ ...f, [a.route.id]: v }))}
                />
              ))}
            </div>
          </section>

          <details className="rounded-lg border border-line p-4 text-[14px] text-ink-2">
            <summary className="cursor-pointer font-medium text-ink">How these numbers are worked out</summary>
            <div className="mt-3 space-y-2">
              <p>Routes come from Geopolitica’s route library: the standard ways round between the two places, with distances from the map and transit times from typical speeds and waiting at ports, canals and borders. Freight on routes other than yours starts as an estimate scaled by distance and canal fees; replace it with your quotes.</p>
              <p>Every hour, Claude reads each event on the map and its latest headlines and says which ports, canals, straits, border crossings, airspace and rail corridors it is disrupting, how likely that is in the next 30 days, how many days it adds and how much it adds to freight. Each event counts once per route, at the point where it bites hardest.</p>
              <p>Chance of disruption = 1 − the product of (1 − each event’s likelihood). Expected delay = the sum of likelihood × mid-range delay. Expected extra cost = freight × the sum of likelihood × mid-range surcharge, plus (cost of a day late + carrying cost a day) × expected delay. Expected cost a year adds freight and the carrying cost of the goods for every day in transit, times shipments a year.</p>
              <p>These are planning estimates from public news, not quotes or guarantees. Check the sources on each event before you act.</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
