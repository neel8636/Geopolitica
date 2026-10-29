"use client";

/*
  The map-first home: the whole screen is the map, and everything else opens from it.

    - Every event is a dot (gold = severe, pale = developing, gold ring = coming up), ringed
      by what is fueling it, split into money / goods / people.
    - Click one: the map flies to it, its fuel dots fan out around it, the events feeding it
      come in along lines coloured by what they move in, and the side panel (a bottom sheet on
      phones) tells the story, with Follow, Ask and Build report.
    - The key is always on screen and teaches itself: colour, icon and word together; pointing
      at a dot lights its key row and the other way round; the words step back once a reader
      has seen each colour a few times and answered one quick check.

  SHARED FILE. The enterprise edition runs a byte-identical copy at
  apps/web/src/components/mapfirst/MapFirst.tsx. Edit this one, then run `npm run sync:shared`
  in apps/atlas. Only relative imports of the shared content and npm packages both apps
  install, so the copy compiles in either app.
*/

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { plainUpdate } from "@/content/format";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { EVENTS, TYPE_LABELS, neighbours, type Flow, type LinkKind, type WorldEvent } from "../../content/events";
import { ASPECTS, type Aspect, type Family } from "../../content/fueling";
import { teaserFor } from "../../content/explainPublic";
import FamIcon from "./FamIcon";

/* ---------- data the page passes in ---------- */

export interface FuelLite { title: string; aspect: Aspect; via: string; place?: string }
export interface NewsLite { title: string; publisher: string; url: string }
export interface CardLite {
  kicker?: string;
  headline?: string;
  keyNumber?: { value: string; label: string };
  update?: { text: string };
  fuel?: { items: (FuelLite & { what?: string; news?: NewsLite[] })[] };
  recent?: NewsLite[];
  otherNews?: NewsLite[];
}
export type ReportSize = "snapshot" | "brief" | "deep";

export interface MapFirstProps {
  fuel: Record<string, FuelLite[]>; // what is fueling each event, for the rings and dots
  pulse: Record<string, { trend: string; day: number }>;
  today: { id: string; headline: string }[];
  loadCards: () => Promise<Record<string, CardLite>>; // the full live cards, fetched on first open
  eventHref: (id: string) => string;
  reportHref: (id: string, size: ReportSize) => string;
  actions?: (id: string) => ReactNode; // Follow, Ask: whatever the app offers
  following?: string[]; // shows a Following tab when given
  extraTab?: { label: string; content: ReactNode };
  buildNote?: string; // under the report sizes: who can build, how many a day
  buildGate?: ReactNode; // shown instead of the build button while the reader is signed out
}

/* ---------- constants ---------- */

const W = 1000;
const H = 520;
const FAMS: Family[] = ["money", "goods", "people"];
const FNAME: Record<Family, string> = { money: "Money", goods: "Goods", people: "People" };
const FWHAT: Record<Family, string> = {
  money: "markets, interest rates, public budgets",
  goods: "energy, trade and shipping, food",
  people: "jobs and wages, living costs, politics, security, people on the move",
};
const FCOL = (f: Family) => `var(--${f})`;
const SIZES: Record<ReportSize, { label: string; m: number; d: string }> = {
  snapshot: { label: "Snapshot", m: 3, d: "The 30-second card and a short brief; the deep dive kept to essentials." },
  brief: { label: "Standard", m: 10, d: "The card, the full five-minute brief and a focused deep dive." },
  deep: { label: "Deep dive", m: 25, d: "Every layer at full depth: brief, all deep-dive modules, evidence." },
};
const PEEK = 112; // phone: height of the lowered sheet (handle, tabs, one line)
const famOf = (a: Aspect): Family => (ASPECTS[a]?.family ?? "people") as Family;
const isDash = (k: LinkKind) => k === "shares_driver" || k === "competes_with";
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

/* the three family icons, drawn once and reused: $ for money, a crate for goods, a person */
function FamilyDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <symbol id="mf-money" viewBox="0 0 24 24">
        <path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.3 1.3-4.3 3.1 0 4.3 9 2.3 9 6.8 0 1.9-1.9 3.1-4.7 3.1-2.3 0-4-.8-4.8-2.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </symbol>
      <symbol id="mf-goods" viewBox="0 0 24 24">
        <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5 12 12l8.5-4.5 M12 12v9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </symbol>
      <symbol id="mf-people" viewBox="0 0 24 24">
        <circle cx="12" cy="7.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M4.5 20.5c.4-4.2 3.3-6.6 7.5-6.6s7.1 2.4 7.5 6.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </symbol>
    </svg>
  );
}
export { FamIcon };

/* ---------- geometry, computed once ---------- */

interface Pt { id: string; x: number; y: number; e: WorldEvent }
function useGeometry() {
  return useMemo(() => {
    const proj = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
    const path = geoPath(proj);
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const land = path(feature(topo, topo.objects.land)) ?? "";
    const sphere = path({ type: "Sphere" }) ?? "";
    const grat = path(geoGraticule10()) ?? "";
    const pts: Pt[] = EVENTS.map((e) => {
      const [x, y] = proj([e.lon, e.lat]) ?? [0, 0];
      return { id: e.id, x, y, e };
    });
    // events in the same city sit a little apart so each can be picked
    for (let it = 0; it < 30; it++) {
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
          if (d < 4.5) {
            const p = (4.5 - d) / 2;
            a.x -= (dx / d) * p; a.y -= (dy / d) * p; b.x += (dx / d) * p; b.y += (dy / d) * p;
          }
        }
    }
    const at = Object.fromEntries(pts.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const edges: { a: string; b: string; kind: LinkKind }[] = [];
    for (const e of EVENTS)
      for (const l of e.links) {
        const k = [e.id, l.to].sort().join("|");
        if (seen.has(k) || !at[l.to]) continue;
        seen.add(k);
        edges.push({ a: e.id, b: l.to, kind: l.kind });
      }
    return { land, sphere, grat, pts, at, edges };
  }, []);
}

const norm = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l] as const; };
function curve(a: Pt, b: Pt, ra: number, rb: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60, len * 0.18);
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  const ua = norm(cx - a.x, cy - a.y), ub = norm(cx - b.x, cy - b.y);
  const A = { x: a.x + ua[0] * ra, y: a.y + ua[1] * ra }, B = { x: b.x + ub[0] * rb, y: b.y + ub[1] * rb };
  return { d: `M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`, A, B, ua, ub, mid: { x: 0.25 * A.x + 0.5 * cx + 0.25 * B.x, y: 0.25 * A.y + 0.5 * cy + 0.25 * B.y } };
}
function headPath(P: { x: number; y: number }, u: readonly [number, number], k: number) {
  const L = 8 * k, w = 4 * k, bx = P.x + u[0] * L, by = P.y + u[1] * L;
  return `M${P.x},${P.y} L${bx - u[1] * w},${by + u[0] * w} L${bx + u[1] * w},${by - u[0] * w}Z`;
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}
const rad = (e: WorldEvent) => 2.6 + e.severity * 1.25;
const dotKind = (e: WorldEvent) => (e.status === "scheduled" ? "sch" : e.severity >= 4 ? "sev" : "oth");

/* ---------- the key's memory: see it, name it, fade it ---------- */

const KEY_STORE = "geopolitica.key.v1";
const SEEN_NEW = "geopolitica.newSeen.v1";
const NEW_DAYS = 7; // an event added from the news counts as new for a week
/* the NEW tag: a small coral pill, drawn on the map and in the lists */
function NewTag({ title }: { title?: string }) {
  return <span title={title} className="ml-1.5 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: "var(--new)", color: "var(--paper)" }}>New</span>;
}
interface Learn { seen: Record<Family, number>; learned: boolean }
function useLearning() {
  const [L, setL] = useState<Learn>({ seen: { money: 0, goods: 0, people: 0 }, learned: false });
  const [quiz, setQuiz] = useState<{ ans: Family; opts: Family[]; msg?: string } | null>(null);
  const credited = useRef(new Set<string>());
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY_STORE) ?? "null");
      if (s?.seen) queueMicrotask(() => setL({ seen: { money: 0, goods: 0, people: 0, ...s.seen }, learned: Boolean(s.learned) }));
    } catch {}
  }, []);
  const save = (n: Learn) => {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(n)); } catch {}
  };
  const expose = useCallback((f: Family, why: string) => {
    if (credited.current.has(f + why)) return;
    credited.current.add(f + why);
    setL((cur) => {
      if (cur.learned || cur.seen[f] >= 3) return cur;
      const n = { ...cur, seen: { ...cur.seen, [f]: cur.seen[f] + 1 } };
      save(n);
      if (FAMS.every((x) => n.seen[x] >= 3)) {
        const ans = FAMS[Math.floor(Math.random() * 3)];
        queueMicrotask(() => setQuiz((q) => q ?? { ans, opts: [...FAMS].sort(() => Math.random() - 0.5) }));
      }
      return n;
    });
  }, []);
  const answer = (f: Family) => {
    if (!quiz) return;
    if (f === quiz.ans) {
      const n = { ...L, learned: true };
      setL(n); save(n); setQuiz(null);
      return true;
    }
    const n = { ...L, seen: { ...L.seen, [quiz.ans]: 1 } };
    setL(n); save(n);
    setQuiz({ ...quiz, msg: `That one is ${FNAME[f]}. ${FNAME[quiz.ans]} gets a few more looks first.` });
    return false;
  };
  const reset = () => { const n = { seen: { money: 0, goods: 0, people: 0 }, learned: false }; credited.current.clear(); setL(n); save(n); setQuiz(null); };
  const knows = (f: Family) => L.learned || L.seen[f] >= 3;
  return { L, quiz: L.learned ? null : quiz, expose, answer, reset, knows };
}

/* ---------- the component ---------- */

type Tab = "today" | "events" | "following" | "extra";

export default function MapFirst(props: MapFirstProps) {
  const { fuel, pulse, today, loadCards, eventHref, reportHref, actions, following, extraTab, buildNote, buildGate } = props;
  const G = useGeometry();
  const learn = useLearning();
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const [vb, setVbState] = useState<[number, number, number, number]>([0, 0, W, H]);
  const vbRef = useRef(vb);
  const [sel, setSel] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  useEffect(() => { selRef.current = sel; }, [sel]);
  const [fuelOn, setFuelOn] = useState<number | null>(null);
  // a connection opened from its line, its badge or a row: the two events, and where the reader came from
  const [conn, setConn] = useState<{ a: string; b: string; back: string | null } | null>(null);
  // where lines cross, a tap can mean more than one connection: offer them to pick from
  const [pick, setPick] = useState<{ x: number; y: number; pairs: string[] } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [layers, setLayers] = useState({ lines: true, fuel: true, pulse: true });
  const [brush, setBrush] = useState<Family | null>(null);
  const [lit, setLit] = useState<Family | null>(null);
  const [building, setBuilding] = useState(false);
  const [size, setSize] = useState<ReportSize>("brief");
  // phone: the panel is a bottom sheet with three resting heights; dragging the handle moves it
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("peek");
  const [sheetDrag, setSheetDrag] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false); // phone: the three layer switches sit behind one button
  const [cards, setCards] = useState<Record<string, CardLite> | null>(null);
  const [q, setQ] = useState("");
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 }); // the map's size on screen, for sizing marks
  const opened = useRef(false);
  const anim = useRef(0);

  const todaySet = useMemo(() => new Set(today.map((t) => t.id)), [today]);
  // events the pipeline added from the news this week: they carry a NEW tag on the map and in
  // the lists; the ping around a dot stops once this reader has opened that event
  const [now, setNow] = useState<number | null>(null);
  const [seenNew, setSeenNew] = useState<Record<string, number>>({});
  const [newOnly, setNewOnly] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      setNow(Date.now());
      try { setSeenNew(JSON.parse(localStorage.getItem(SEEN_NEW) ?? "{}") ?? {}); } catch {}
    });
  }, []);
  const newSet = useMemo(() => {
    const s = new Set<string>();
    if (now) for (const e of EVENTS) if (e.auto && now - Date.parse(e.auto.addedAt) < NEW_DAYS * 864e5) s.add(e.id);
    return s;
  }, [now]);
  useEffect(() => {
    if (!sel || !newSet.has(sel) || seenNew[sel]) return;
    const n = { ...seenNew, [sel]: Date.now() };
    queueMicrotask(() => setSeenNew(n));
    try { localStorage.setItem(SEEN_NEW, JSON.stringify(n)); } catch {}
  }, [sel, newSet, seenNew]);
  const links = useMemo(() => Object.fromEntries(EVENTS.map((e) => [e.id, neighbours(e.id)])), []);
  const fam = (id: string) => {
    const c: Record<Family, number> = { money: 0, goods: 0, people: 0 };
    for (const f of fuel[id] ?? []) c[famOf(f.aspect)]++;
    return c;
  };

  /* size: the map fills the screen under the site header */
  useEffect(() => {
    const fit = () => {
      const hdr = document.querySelector("header")?.getBoundingClientRect().height ?? 60;
      setHeight(Math.max(480, window.innerHeight - hdr));
      setMobile(window.innerWidth < 760);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setBox({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* the live cards, for the panel */
  useEffect(() => {
    let alive = true;
    loadCards().then((c) => alive && setCards(c)).catch(() => {});
    return () => { alive = false; };
  }, [loadCards]);

  /* ---- view box ---- */
  const scale = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    const [, , w, h] = vbRef.current;
    return r && r.width ? Math.max(w / r.width, h / r.height) : 1;
  }, []);
  const setVb = useCallback((v: [number, number, number]) => {
    let [x, y, w] = v;
    w = Math.min(Math.max(w, 70), W * 1.05);
    const h = (w * H) / W;
    // generous bounds: an event at the edge of the world can still sit in the middle of the
    // clear part of the screen, beside the panel
    x = Math.min(Math.max(x, -w * 0.8), W - w * 0.2);
    y = Math.min(Math.max(y, -h * 0.8), H - h * 0.2);
    vbRef.current = [x, y, w, h];
    setVbState([x, y, w, h]);
  }, []);
  // the panel covers part of the map, so "centre" means the middle of the clear part
  const offsetFor = useCallback((w: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    const p = panelRef.current?.getBoundingClientRect();
    if (!r || !p || !r.width) return [0, 0];
    const k = Math.max(w / r.width, (w * H) / W / r.height);
    return window.innerWidth < 760 ? [0, (p.height / 2) * k] : [((p.width + 16) / 2) * k, 0];
  }, []);
  const flyTo = useCallback((cx: number, cy: number, w1: number, ms = 950) => {
    cancelAnimationFrame(anim.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [x0, y0, w0, h0] = vbRef.current;
    const o0 = offsetFor(w0);
    const s0 = [x0 + w0 / 2 - o0[0], y0 + h0 / 2 - o0[1]];
    const dist = Math.hypot(cx - s0[0], cy - s0[1]);
    const bump = Math.max(0, dist * 1.1 - Math.max(w0, w1) * 0.4);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const w = w0 + (w1 - w0) * e + bump * Math.sin(Math.PI * e);
      const off = offsetFor(w);
      const x = s0[0] + (cx - s0[0]) * e + off[0], y = s0[1] + (cy - s0[1]) * e + off[1];
      setVb([x - w / 2, y - (w * H) / W / 2, w]);
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [offsetFor, setVb]);
  const world = useCallback(() => flyTo(W / 2, H / 2, W * 1.02, 700), [flyTo]);
  useEffect(() => {
    if (height === null) return;
    const id = requestAnimationFrame(() => {
      const r = svgRef.current?.getBoundingClientRect();
      // a phone held upright: fill the height rather than show a thin strip of world
      const clear = r ? r.height - (window.innerWidth < 760 ? PEEK : 0) : 0;
      const w = r && window.innerWidth < 760 && r.width / clear < W / H ? Math.max(W * 0.42, (H * r.width) / clear) : W * 1.02;
      const off = offsetFor(w);
      const cx = window.innerWidth < 760 ? W * 0.52 : W / 2;
      setVb([cx + off[0] - w / 2, H * 0.48 + off[1] - (w * H) / W / 2, w]);
    });
    return () => cancelAnimationFrame(id);
  }, [height, offsetFor, setVb]);
  const zoomBy = (f: number, px?: number, py?: number) => {
    const [x, y, w, h] = vbRef.current;
    let fx = px, fy = py;
    if (fx === undefined || fy === undefined) {
      // the buttons zoom on the selected event, or on the middle of the part of the map you can see
      const p = selRef.current ? G.at[selRef.current] : null;
      const off = offsetFor(w);
      fx = p ? p.x : x + w / 2 - off[0];
      fy = p ? p.y : y + h / 2 - off[1];
    }
    setVb([fx - (fx - x) / f, fy - (fy - y) / f, w / f]);
  };

  /* ---- selecting ---- */
  const expose = learn.expose;
  const select = useCallback((id: string | null, fly = true) => {
    setSel(id); setFuelOn(null); setBuilding(false); setTip(null); setConn(null);
    if (!id) return;
    const p = G.at[id];
    for (const f of fuel[id] ?? []) expose(famOf(f.aspect), "ev:" + id);
    for (const l of links[id] ?? []) if (!isDash(l.kind) && (l.flow === "in" || l.flow === "both")) expose(famOf(l.aspect), "ev:" + id);
    if (window.innerWidth < 760) setSheet("half");
    if (fly && p) {
      const nearest = Math.min(...G.pts.filter((o) => o.id !== id).map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
      flyTo(p.x, p.y, Math.max(W / 9, Math.min(W / 4.5, nearest * 9)));
    }
  }, [G, fuel, links, expose, flyTo]);
  // open a connection: the map frames both events and the panel tells the story between them
  const openConn = useCallback((a: string, b: string, back: string | null) => {
    const A = G.at[a], B = G.at[b];
    if (!A || !B) return;
    setSel(null); setFuelOn(null); setBuilding(false); setTip(null);
    setConn({ a, b, back });
    const l = links[a]?.find((x) => x.event.id === b);
    if (l) expose(famOf(l.aspect), `conn:${a}${b}`);
    if (window.innerWidth < 760) setSheet("half");
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    flyTo((A.x + B.x) / 2, (A.y + B.y) / 2, Math.min(W * 0.95, Math.max(W / 6, d * 1.8 + 60)));
  }, [G, links, expose, flyTo]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") select(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);
  // a link from elsewhere can open an event: /#event=<id>
  useEffect(() => {
    if (height === null) return;
    if (opened.current) return;
    opened.current = true;
    // arriving from another page with a hash: start at the top, with the map in full view
    if (/(event|conn)=/.test(window.location.hash)) window.scrollTo(0, 0);
    const m = window.location.hash.match(/event=([\w-]+)/);
    if (m && G.at[m[1]]) { const id = m[1]; setTimeout(() => select(id), 300); }
    // a link from an event page can open one connection: /#conn=<a>~<b>
    const c = window.location.hash.match(/conn=([\w-]+)~([\w-]+)/);
    if (c && G.at[c[1]] && G.at[c[2]]) { const [, a, b] = c; setTimeout(() => openConn(a, b, null), 300); }
  }, [height, G, select, openConn]);

  /* ---- pointer: drag to pan, wheel or pinch to zoom, tap to pick ---- */
  const pts = useRef(new Map<number, [number, number]>());
  const drag = useRef<{ x: number; y: number; vb: number[]; moved: boolean; pinch?: { d: number; vb: number[]; c: { x: number; y: number } } } | null>(null);
  // screen point → map point, worked out from the view box just set rather than from the DOM,
  // which can be a frame behind during a fast scroll; otherwise each wheel step drifts
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const [x, y, w, h] = vbRef.current;
    const s = Math.min(r.width / w, r.height / h);
    return { x: x + (cx - r.left - (r.width - w * s) / 2) / s, y: y + (cy - r.top - (r.height - h * s) / 2) / s };
  };
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  // events within a fingertip of a screen point, nearest first (distances in screen pixels)
  const nearestDots = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const [, , w, h] = vbRef.current;
    const s = Math.min(r.width / w, r.height / h);
    const p = toSvg(cx, cy);
    const reach = window.innerWidth < 760 ? 24 : 16;
    return G.pts
      .map((q) => ({ id: q.id, d: Math.hypot(q.x - p.x, q.y - p.y) * s }))
      .filter((q) => q.d <= reach)
      .sort((a, b) => a.d - b.d);
  };
  useEffect(() => {
    const s = svgRef.current;
    if (!s) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      cancelAnimationFrame(anim.current);
      const p = toSvg(ev.clientX, ev.clientY);
      zoomBy(Math.exp(-ev.deltaY * 0.0022), p.x, p.y);
    };
    s.addEventListener("wheel", onWheel, { passive: false });
    return () => s.removeEventListener("wheel", onWheel);
  });
  const onDown = (ev: React.PointerEvent) => {
    setPick(null);
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    pts.current.set(ev.pointerId, [ev.clientX, ev.clientY]);
    cancelAnimationFrame(anim.current);
    drag.current = { x: ev.clientX, y: ev.clientY, vb: [...vbRef.current], moved: false };
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      drag.current.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: [...vbRef.current], c: toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
      drag.current.moved = true;
    }
  };
  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!pts.current.has(ev.pointerId) || !d) return hoverAt(ev);
    pts.current.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pts.current.size === 2 && d.pinch) {
      const [a, b] = [...pts.current.values()];
      const f = Math.hypot(a[0] - b[0], a[1] - b[1]) / d.pinch.d;
      const [x, y, w] = d.pinch.vb, c = d.pinch.c;
      setVb([c.x - (c.x - x) / f, c.y - (c.y - y) / f, w / f]);
      d.moved = true;
      return;
    }
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) d.moved = true;
    if (d.moved) {
      const k = scale();
      setVb([d.vb[0] - (ev.clientX - d.x) * k, d.vb[1] - (ev.clientY - d.y) * k, d.vb[2]]);
    }
  };
  const onUp = (ev: React.PointerEvent) => {
    pts.current.delete(ev.pointerId);
    const d = drag.current;
    if (pts.current.size === 0) drag.current = null;
    if (!d || d.moved) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
    const sat = el?.closest("[data-fuel]");
    const badge = el?.closest("[data-link]");
    const dot = el?.closest("[data-ev]");
    const line = el?.closest("[data-pair]");
    if (sat && sel) {
      const i = Number(sat.getAttribute("data-fuel"));
      setFuelOn(i);
      learn.expose(famOf((fuel[sel] ?? [])[i]?.aspect ?? "politics"), `fuel:${sel}${i}`);
      if (window.innerWidth < 760) setSheet("full");
      // scroll the panel (never the page) to that row
      setTimeout(() => {
        const box = panelBody.current, row = box?.querySelector<HTMLElement>(`[data-fi="${i}"]`);
        if (box && row) box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: "smooth" });
      }, 260);
    } else if (badge) {
      const other = badge.getAttribute("data-link")!;
      const host = sel ?? conn?.a ?? other;
      openConn(host, other, sel);
    } else if (dot || nearestDots(ev.clientX, ev.clientY).length) {
      // pick the dot nearest the finger, not whichever is drawn on top; where several sit
      // under one fingertip (Paris, Brussels), zoom in on them first
      const near = nearestDots(ev.clientX, ev.clientY);
      const p = toSvg(ev.clientX, ev.clientY);
      if (near.length > 1 && near[1].d - near[0].d < 10 && vbRef.current[2] > W / 5) zoomBy(2.4, p.x, p.y);
      else select(near[0]?.id ?? dot!.getAttribute("data-ev"));
    } else if (line) {
      const pairs = [...new Set(document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.getAttribute("data-pair")).filter(Boolean) as string[])];
      if (pairs.length > 1) {
        const box = wrap.current!.getBoundingClientRect();
        setPick({ x: ev.clientX - box.left, y: ev.clientY - box.top, pairs });
        return;
      }
      const [a, b] = pairs[0].split("~");
      openConn(a, b, sel);
    } else {
      // double-tap (or double-click) on open map zooms in on that spot
      const now = performance.now(), lt = lastTap.current;
      if (now - lt.t < 320 && Math.hypot(ev.clientX - lt.x, ev.clientY - lt.y) < 30) {
        const p = toSvg(ev.clientX, ev.clientY);
        zoomBy(2, p.x, p.y);
        lastTap.current = { t: 0, x: 0, y: 0 };
        return;
      }
      lastTap.current = { t: now, x: ev.clientX, y: ev.clientY };
      if (sel || conn) select(null);
    }
  };
  const hoverAt = (ev: React.PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
    const sat = el?.closest("[data-fuel]"), badge = el?.closest("[data-link]"), dot = el?.closest("[data-ev]"), line = el?.closest("[data-pair]");
    const box = wrap.current!.getBoundingClientRect();
    const at = { x: ev.clientX - box.left, y: ev.clientY - box.top };
    let html: ReactNode = null, f: Family | null = null;
    if (sat && sel) {
      const it = (fuel[sel] ?? [])[Number(sat.getAttribute("data-fuel"))];
      if (it) { f = famOf(it.aspect); html = <><b>{it.title}</b><br />{FNAME[f]} · {ASPECTS[it.aspect].label}<br />moves in: {it.via}</>; }
    } else if (badge && sel) {
      const l = links[sel].find((x) => x.event.id === badge.getAttribute("data-link"));
      if (l) { f = famOf(l.aspect); html = <><b>{FNAME[f]}</b> · {ASPECTS[l.aspect].label}<br />{teaserFor(sel, l.event.id)?.hook ?? l.event.title}<br /><i>Click to see how they connect</i></>; }
    } else if (dot) {
      const id = dot.getAttribute("data-ev")!;
      const e = G.at[id].e, c = fam(id);
      html = <><b>{e.title}</b>{FAMS.some((x) => c[x]) ? <><br />Fueled by {FAMS.filter((x) => c[x]).map((x) => `${FNAME[x].toLowerCase()} (${c[x]})`).join(", ")}</> : null}</>;
    } else if (line) {
      const [a, b] = line.getAttribute("data-pair")!.split("~");
      const l = links[a]?.find((x) => x.event.id === b);
      if (l) {
        f = isDash(l.kind) ? null : famOf(l.aspect);
        html = <>{teaserFor(a, b)?.hook ?? `${G.at[a].e.title} and ${G.at[b].e.title}`}<br /><i>Click to see how they connect</i></>;
      }
    }
    const id = dot?.getAttribute("data-ev") ?? null;
    if (id !== hover) setHover(id);
    if (f !== lit && !brush) setLit(f);
    setTip(html ? { ...at, html } : null);
  };

  /* ---- drawing ---- */
  const k = box.w ? Math.max(vb[2] / box.w, vb[3] / box.h) : vb[2] / 1000;
  const S = sel ? G.at[sel] : null;
  const selLinks = sel ? links[sel] : [];
  const near = conn ? new Set([conn.a, conn.b]) : sel ? new Set([sel, ...selLinks.map((l) => l.event.id)]) : newOnly && newSet.size ? newSet : null;
  const zoomed = vb[2] < W / 3.2;
  const faded = (f: Family) => (brush && f !== brush ? 0.12 : 1);
  const satellites = (p: Pt, R: number, r: number) => {
    const items = fuel[p.id] ?? [];
    return items.map((f, i) => {
      const a = -Math.PI / 2 + ((2 * Math.PI) / items.length) * i;
      return { f, i, fam: famOf(f.aspect), x: p.x + Math.cos(a) * R * k, y: p.y + Math.sin(a) * R * k, r: r * k };
    });
  };

  const edgeEls: ReactNode[] = [];
  const topEls: ReactNode[] = [];
  const hitEls: ReactNode[] = [];
  if (layers.lines)
    for (const ed of G.edges) {
      const a = G.at[ed.a], b = G.at[ed.b];
      const t = curve(a, b, (rad(a.e) + 4) * k, (rad(b.e) + 4) * k);
      const key = ed.a + ed.b;
      const dashed = isDash(ed.kind);
      if (conn) {
        const on = (ed.a === conn.a && ed.b === conn.b) || (ed.a === conn.b && ed.b === conn.a);
        if (!on) { edgeEls.push(<path key={key} d={t.d} fill="none" stroke="var(--edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.06} />); continue; }
        const l = links[ed.a].find((x) => x.event.id === ed.b);
        const f = l ? famOf(l.aspect) : "people";
        const col = dashed ? "var(--ink-2)" : FCOL(f);
        const fl: Flow = l?.flow ?? "out";
        topEls.push(
          <g key={key}>
            <path d={t.d} fill="none" stroke={col} strokeWidth={3.2} strokeDasharray={dashed ? "6 5" : undefined} vectorEffect="non-scaling-stroke" />
            {!dashed && fl !== "in" ? <path d={headPath(t.B, t.ub, k * 1.2)} fill={col} /> : null}
            {!dashed && (fl === "in" || fl === "both") ? <path d={headPath(t.A, t.ua, k * 1.2)} fill={col} /> : null}
            {!dashed ? (
              <circle r={3.2 * k} fill={col}>
                <animateMotion dur="2s" repeatCount="indefinite" path={t.d} {...(fl === "in" ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})} />
              </circle>
            ) : null}
            {!dashed ? (
              <g>
                <circle cx={t.mid.x} cy={t.mid.y} r={10 * k} fill={col} stroke="var(--paper)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <use href={`#mf-${f}`} x={t.mid.x - 6.5 * k} y={t.mid.y - 6.5 * k} width={13 * k} height={13 * k} style={{ color: "#fff" }} />
              </g>
            ) : null}
          </g>,
        );
        continue;
      }
      // a wide, invisible line on top of each connection, so the line itself can be pointed at and clicked
      const hit = <path key={key + "x"} d={t.d} fill="none" stroke="transparent" strokeWidth={mobile ? 18 : 12} vectorEffect="non-scaling-stroke" data-pair={`${ed.a}~${ed.b}`} style={{ cursor: "pointer", pointerEvents: "stroke" }} />;
      if (!sel || ed.a === sel || ed.b === sel) hitEls.push(hit);
      if (!sel || (ed.a !== sel && ed.b !== sel)) {
        edgeEls.push(<path key={key} d={t.d} fill="none" stroke={dashed ? "var(--ink-3)" : "var(--edge)"} strokeWidth={1.1} strokeDasharray={dashed ? "4 4" : undefined} vectorEffect="non-scaling-stroke" opacity={sel ? 0.07 : dashed ? 0.5 : 1} />);
        if (!sel && !dashed) {
          const flow: Flow = links[ed.a].find((l) => l.event.id === ed.b)?.flow ?? "out";
          if (flow !== "in") edgeEls.push(<path key={key + "h"} d={headPath(t.B, t.ub, k * 0.8)} fill="var(--edge)" />);
          if (flow === "in" || flow === "both") edgeEls.push(<path key={key + "t"} d={headPath(t.A, t.ua, k * 0.8)} fill="var(--edge)" />);
        }
        continue;
      }
      const other = ed.a === sel ? ed.b : ed.a;
      const l = selLinks.find((x) => x.event.id === other);
      if (!l) continue;
      if (dashed) { edgeEls.push(<path key={key} d={t.d} fill="none" stroke="var(--ink-3)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity={0.9} />); continue; }
      const selIsA = ed.a === sel;
      const into = l.flow === "in" || l.flow === "both";
      if (into) {
        const f = famOf(l.aspect), col = FCOL(f), o = faded(f);
        topEls.push(
          <g key={key} opacity={o}>
            <path d={t.d} fill="none" stroke={col} strokeWidth={2.6} vectorEffect="non-scaling-stroke" />
            <path d={selIsA ? headPath(t.A, t.ua, k) : headPath(t.B, t.ub, k)} fill={col} />
            <circle r={2.8 * k} fill={col}>
              <animateMotion dur="2.3s" repeatCount="indefinite" path={t.d} {...(selIsA ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})} />
            </circle>
            <g data-link={other} style={{ cursor: "pointer" }}>
              <circle cx={t.mid.x} cy={t.mid.y} r={8.5 * k} fill={col} stroke="var(--paper)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <use href={`#mf-${f}`} x={t.mid.x - 5.5 * k} y={t.mid.y - 5.5 * k} width={11 * k} height={11 * k} style={{ color: "#fff" }} />
            </g>
            {!learn.knows(f) ? <text x={t.mid.x} y={t.mid.y + 19 * k} textAnchor="middle" className="mf-flbl" style={{ fontSize: 9.5 * k, strokeWidth: 3 * k, fill: col }}>{FNAME[f]}</text> : null}
          </g>,
        );
      }
      if (l.flow === "out") {
        edgeEls.push(<path key={key} d={t.d} fill="none" stroke="var(--gold)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />);
        edgeEls.push(<path key={key + "h"} d={selIsA ? headPath(t.B, t.ub, k) : headPath(t.A, t.ua, k)} fill="var(--gold)" />);
        edgeEls.push(
          <circle key={key + "d"} r={2.6 * k} fill="var(--gold-hi)">
            <animateMotion dur="2.3s" repeatCount="indefinite" path={t.d} {...(selIsA ? {} : { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" })} />
          </circle>,
        );
      }
    }

  const [vx, vy, vw, vh] = vb;
  const dots = G.pts.map((p) => {
    // a phone shows the whole map on a small screen: smaller dots and tighter rings keep Europe readable
    const ds = mobile ? 0.8 : 1;
    const e = p.e, r = rad(e) * k * ds, dim = near && !near.has(p.id), isSel = sel === p.id;
    const c = fam(p.id), n = (fuel[p.id] ?? []).length;
    const ring: ReactNode[] = [];
    if (layers.fuel && n && !isSel) {
      const R = r + 3.6 * k * ds, gap = n > 1 ? 0.18 : 0;
      let a0 = -Math.PI / 2;
      for (const f of FAMS)
        if (c[f]) {
          const a1 = a0 + (2 * Math.PI * c[f]) / n;
          ring.push(
            <path key={f} d={c[f] === n ? `M${p.x - R},${p.y} a${R},${R} 0 1 1 ${2 * R},0 a${R},${R} 0 1 1 ${-2 * R},0` : arc(p.x, p.y, R, a0 + gap / 2, a1 - gap / 2)} fill="none" stroke={FCOL(f)} strokeWidth={2.6} vectorEffect="non-scaling-stroke" opacity={faded(f)} />,
          );
          a0 = a1;
        }
    }
    const kind = dotKind(e);
    const isNew = newSet.has(p.id);
    const inView = p.x > vx && p.x < vx + vw && p.y > vy && p.y < vy + vh;
    return (
      <g key={p.id}>
        <g data-ev={p.id} style={{ cursor: "pointer" }} opacity={dim ? 0.22 : 1}>
          {layers.pulse && todaySet.has(p.id) ? <circle className="mf-halo" cx={p.x} cy={p.y} r={r * 1.5} fill="none" stroke="var(--gold)" strokeWidth={1.3} vectorEffect="non-scaling-stroke" /> : null}
          {isNew && !seenNew[p.id] ? <circle className="mf-ping" cx={p.x} cy={p.y} r={r + 7 * k * ds} fill="none" stroke="var(--new)" strokeWidth={mobile ? 1.6 : 2} vectorEffect="non-scaling-stroke" /> : null}
          {isNew ? <circle cx={p.x} cy={p.y} r={r + 7 * k * ds} fill="none" stroke="var(--new)" strokeWidth={mobile ? 1.6 : 2} vectorEffect="non-scaling-stroke" /> : null}
          {ring}
          <circle
            cx={p.x} cy={p.y} r={r}
            fill={kind === "sev" ? "var(--gold)" : kind === "oth" ? "var(--other)" : "var(--paper)"}
            stroke={kind === "sch" ? "var(--gold)" : "var(--paper)"}
            strokeWidth={kind === "sch" ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
            style={kind === "sev" ? { filter: "var(--glow)" } : undefined}
          />
          <circle cx={p.x} cy={p.y} r={Math.max(r + 4 * k, 12 * k)} fill="transparent" />
          {isSel ? <circle cx={p.x} cy={p.y} r={r + 5 * k} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" /> : null}
        </g>

        {zoomed && layers.fuel && n && !isSel && !dim && inView
          ? satellites(p, 24, 4.2).map((s) => (
              <g key={s.i} opacity={faded(s.fam)} pointerEvents="none">
                <line x1={p.x} y1={p.y} x2={s.x} y2={s.y} stroke={FCOL(s.fam)} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />
                <circle cx={s.x} cy={s.y} r={s.r} fill={FCOL(s.fam)} stroke="var(--paper)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </g>
            ))
          : null}
      </g>
    );
  });

  // the NEW pills sit above every dot, so a crowded region cannot hide one
  // on a phone at world view the pills pile on top of each other: the coral ring marks a new
  // event there, and the pills come back once the reader zooms in or picks "new"
  const pillsOn = !mobile || vw < W / 2.6 || newOnly || Boolean(near);
  const pills = G.pts
    .filter((p) => pillsOn && newSet.has(p.id) && p.id !== sel && !(near && !near.has(p.id))) // the open event says NEW in the panel
    .map((p) => {
      const r = rad(p.e) * k;
      return (
        <g key={p.id} pointerEvents="none" transform={`translate(${p.x + r + 4 * k},${p.y - r - 14 * k})`}>
          <rect width={29 * k} height={13 * k} rx={6.5 * k} fill="var(--new)" stroke="var(--paper)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={14.5 * k} y={9.6 * k} textAnchor="middle" fill="var(--paper)" style={{ fontSize: 8.6 * k, fontWeight: 800, letterSpacing: 0.6 * k, fontFamily: "var(--font-sans)" }}>NEW</text>
        </g>
      );
    });

  // labels: the selection and its neighbours, or everything when zoomed in, without overlaps
  const labels: ReactNode[] = [];
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const p of G.pts)
    if (pillsOn && newSet.has(p.id) && !(near && !near.has(p.id))) {
      const r = rad(p.e) * k, x0 = p.x + r + 4 * k, y0 = p.y - r - 14 * k;
      placed.push({ x0, x1: x0 + 29 * k, y0, y1: y0 + 13 * k });
    }
  if (S && layers.fuel && (fuel[S.id] ?? []).length) placed.push({ x0: S.x - 60 * k, x1: S.x + 60 * k, y0: S.y - 62 * k, y1: S.y + 62 * k });
  for (const p of [...G.pts].sort((a, b) => Number(b.id === sel) - Number(a.id === sel) || Number(b.id === hover) - Number(a.id === hover) || b.e.severity - a.e.severity)) {
    const show = (near && near.has(p.id)) || (zoomed && !sel) || hover === p.id;
    if (!show) continue;
    const isSel = sel === p.id;
    const below = isSel && layers.fuel && (fuel[p.id] ?? []).length;
    const t = short(p.e.title, isSel ? 44 : 30);
    const y = p.y + (below ? (FAMS.every((f) => learn.knows(f)) ? 76 : 90) * k : -(rad(p.e) + 8) * k);
    const w = t.length * 6.4 * k, box = { x0: p.x - w / 2, x1: p.x + w / 2, y0: y - 12 * k, y1: y + 3 * k };
    if (!isSel && p.id !== hover && placed.some((q2) => q2.x0 < box.x1 && box.x0 < q2.x1 && q2.y0 < box.y1 && box.y0 < q2.y1)) continue;
    placed.push(box);
    labels.push(<text key={p.id} x={p.x} y={y} textAnchor="middle" className="mf-lbl" style={{ fontSize: 12.5 * k, strokeWidth: 3.2 * k, fontWeight: isSel ? 700 : 400 }}>{t}</text>);
  }

  const sats =
    S && layers.fuel
      ? satellites(S, 48, 10.5).map((s) => {
          const on = fuelOn === s.i;
          return (
            <g key={s.i} data-fuel={s.i} style={{ cursor: "pointer" }} opacity={faded(s.fam)}>
              <line x1={S.x} y1={S.y} x2={s.x} y2={s.y} stroke={FCOL(s.fam)} strokeWidth={1.2} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <circle cx={s.x} cy={s.y} r={s.r * (on ? 1.2 : 1)} fill={FCOL(s.fam)} stroke={on ? "var(--ink)" : "var(--paper)"} strokeWidth={on ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
              <use href={`#mf-${s.fam}`} x={s.x - 6.5 * k} y={s.y - 6.5 * k} width={13 * k} height={13 * k} style={{ color: "#fff", pointerEvents: "none" }} />
              {!learn.knows(s.fam) ? <text x={s.x} y={s.y + (s.y > S.y ? 22 : -15) * k} textAnchor="middle" className="mf-flbl" style={{ fontSize: 9.5 * k, strokeWidth: 3 * k, fill: FCOL(s.fam) }}>{FNAME[s.fam]}</text> : null}
            </g>
          );
        })
      : null;

  /* ---- search ---- */
  const hits = q.trim() ? EVENTS.filter((e) => `${e.title} ${e.region} ${e.type}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 7) : [];

  /* ---- panel ---- */
  const cardOf = (id: string) => cards?.[id];
  const kickerOf = (id: string) => cardOf(id)?.kicker ?? `${TYPE_LABELS[G.at[id].e.type]} · ${G.at[id].e.region}`;
  const mini = (id: string) => {
    const c = fam(id);
    return FAMS.some((f) => c[f]) ? (
      <span className="ml-1.5 inline-flex gap-[3px] align-middle" title="What's fueling it">
        {FAMS.filter((f) => c[f]).map((f) => <i key={f} className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: FCOL(f) }} />)}
      </span>
    ) : null;
  };
  const row = (id: string, n?: number) => {
    const e = G.at[id].e, kind = dotKind(e);
    return (
      <button key={id} type="button" onClick={() => select(id)} className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-2 text-left hover:bg-paper-2">
        {n != null ? (
          <span className="w-4 shrink-0 font-serif text-xl leading-tight text-gold">{n}</span>
        ) : (
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={kind === "sch" ? { border: "2px solid var(--gold)" } : { background: kind === "sev" ? "var(--gold)" : "var(--other)" }} />
        )}
        <span className="min-w-0">
          <span className="block text-[14px] font-medium leading-snug">{e.title}{newSet.has(id) ? <NewTag title="Added from the news this week" /> : null}{mini(id)}</span>
          <span className="block text-xs text-ink-3">{kickerOf(id)}</span>
        </span>
      </button>
    );
  };
  const spine = (id: string) => {
    const m = new Map<Aspect, Family>();
    for (const f of fuel[id] ?? []) if (!m.has(f.aspect)) m.set(f.aspect, famOf(f.aspect));
    for (const l of links[id]) if (!isDash(l.kind) && (l.flow === "in" || l.flow === "both") && !m.has(l.aspect)) m.set(l.aspect, famOf(l.aspect));
    return [...m.entries()].slice(0, 5);
  };

  const h3 = (children: ReactNode) => <h3 style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.08em" }} className="mb-2 mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{children}</h3>;

  const eventView = (id: string) => {
    const e = G.at[id].e;
    const card = cardOf(id);
    const fitems = card?.fuel?.items?.length ? card.fuel.items : (fuel[id] ?? []);
    const ls = links[id];
    const ins = ls.filter((l) => !isDash(l.kind) && (l.flow === "in" || l.flow === "both"));
    const outs = ls.filter((l) => !isDash(l.kind) && l.flow === "out");
    const shared = ls.filter((l) => isDash(l.kind));
    const p = pulse[id];
    const c = fam(id);
    // a connection row: the row opens how the two connect; "fly" goes to the other event
    const linkBtn = (to: string, icon: ReactNode, sub: ReactNode) => (
      <div key={to} className="flex items-start gap-1 rounded-md hover:bg-paper-2">
        <button type="button" onClick={() => openConn(id, to, id)} className="flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-2 text-left">
          <span className="mt-0.5 flex w-6 shrink-0 justify-center text-gold">{icon}</span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-snug">{G.at[to].e.title}</span>
            <span className="block text-xs text-ink-3">{sub}</span>
            {teaserFor(id, to) ? <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{teaserFor(id, to)!.hook} <span className="text-gold">How? →</span></span> : null}
          </span>
        </button>
        <button type="button" onClick={() => select(to)} className="shrink-0 px-1.5 pt-2 text-xs text-gold hover:underline" aria-label={`Fly to ${G.at[to].e.title}`}>fly ↗</button>
      </div>
    );
    return (
      <div>
        <button type="button" onClick={() => { select(null); world(); }} className="mb-2 text-[13px] text-ink-2 hover:text-ink">
          ← {tab === "events" ? "All events" : tab === "following" ? "Following" : tab === "extra" && extraTab ? extraTab.label : "Today's ripples"}
        </button>
        {newSet.has(id) && e.auto ? (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-2">
            <NewTag />
            <span className="ml-0.5">Added from the news on {new Date(e.auto.addedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
          </p>
        ) : null}
        <p className="text-xs text-ink-3">
          {kickerOf(id)}
          {p ? ` · ${p.trend === "rising" ? "▲ rising" : p.trend} · ${p.day} headline${p.day === 1 ? "" : "s"} today` : ""}
        </p>
        <h2 className="mt-1 font-serif text-2xl leading-tight">{e.title}</h2>
        <p className="mt-1.5 text-[13.5px] text-ink-2">{card?.headline ?? e.summary.slice(0, 220)}</p>
        {card?.keyNumber ? (
          <div className="mt-3 rounded-lg bg-paper-2 px-3 py-2.5">
            <p className="font-serif text-2xl text-gold">{card.keyNumber.value}</p>
            <p className="text-[13px] text-ink-2">{card.keyNumber.label}</p>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" data-spotlight="build" onClick={() => setBuilding((b) => !b)} className="inline-flex items-center gap-1.5 rounded-sm bg-teal px-3 py-1.5 text-sm font-semibold text-paper hover:opacity-90">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M5 3h10l4 4v14H5z M9 12h6 M9 16h6 M9 8h3" /></svg>
            Build report
          </button>
          {actions?.(id)}
          <a href={eventHref(id)} className="inline-flex items-center rounded-sm border border-line px-3 py-1.5 text-sm no-underline hover:border-ink">Open the event</a>
        </div>
        {building ? (
          <div className="mt-3 rounded-lg border border-gold p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Built around what&rsquo;s fueling it</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {spine(id).map(([a, f]) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-[12.5px]">
                  <FamIcon f={f} size={20} /> {ASPECTS[a].label}
                </span>
              ))}
            </div>
            <div className="mt-2.5 grid gap-1.5" role="radiogroup" aria-label="Report size">
              {(Object.keys(SIZES) as ReportSize[]).map((z) => (
                <button key={z} type="button" role="radio" aria-checked={size === z} onClick={() => setSize(z)} className={`rounded-md border px-3 py-2 text-left ${size === z ? "border-gold ring-1 ring-gold" : "border-line hover:border-ink-3"}`}>
                  <span className="flex items-baseline justify-between gap-2"><b className="text-sm">{SIZES[z].label}</b><span className="text-xs text-ink-3">about {SIZES[z].m} min</span></span>
                  <span className="block text-[12.5px] leading-snug text-ink-2">{SIZES[z].d}</span>
                </button>
              ))}
            </div>
            {buildGate ? (
              <div className="mt-2.5">{buildGate}</div>
            ) : (
              <a href={reportHref(id, size)} className="mt-2.5 inline-flex items-center rounded-sm bg-teal px-3 py-1.5 text-sm font-semibold text-paper no-underline hover:opacity-90">
                Build {SIZES[size].label.toLowerCase()} report →
              </a>
            )}
            <p className="mt-1.5 text-xs text-ink-3">Same format at every size: card, brief, deep dive, evidence.{buildNote ? ` ${buildNote}` : ""}</p>
          </div>
        ) : null}
        {card?.update ? (<>{h3("What changed")}<p className="border-l-[3px] border-gold pl-2.5 text-[14px]">{plainUpdate(card.update.text)}</p></>) : null}
        {h3(<>
          What&rsquo;s fueling it
          {FAMS.some((f) => c[f]) ? <span className="inline-flex gap-[3px]">{FAMS.filter((f) => c[f]).map((f) => <i key={f} className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: FCOL(f) }} />)}</span> : null}
        </>)}
        {fitems.length ? (
          fitems.map((f, i) => {
            const ff = famOf(f.aspect), on = fuelOn === i;
            const rich = f as FuelLite & { what?: string; news?: NewsLite[] };
            const news = rich.news ?? [];
            return (
              <div key={i} data-fi={i} className={`mb-1.5 overflow-hidden rounded-lg border ${on ? "border-ink-2" : "border-line"}`} style={{ opacity: faded(ff) < 1 ? 0.35 : 1 }} onPointerEnter={() => setLit(ff)} onPointerLeave={() => setLit(null)}>
                <button type="button" onClick={() => { setFuelOn(on ? null : i); learn.expose(ff, `fuel:${id}${i}`); }} className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left">
                  <FamIcon f={ff} size={24} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug">{f.title}</span>
                    <span className="block text-xs text-ink-3"><b className="font-semibold" style={{ color: FCOL(ff) }}>{FNAME[ff]}</b> · {ASPECTS[f.aspect]?.label} · moves in: {f.via}{f.place ? ` · ${f.place}` : ""}</span>
                  </span>
                </button>
                {on ? (
                  <div className="px-2.5 pb-2.5 pl-11 text-[13px]">
                    {rich.what ? <p className="mb-1.5 text-ink-2">{rich.what}</p> : null}
                    {news.length ? news.map((n) => (
                      <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="block border-t border-dashed border-line py-1.5 text-ink no-underline hover:underline">
                        {n.title} <span className="text-xs text-ink-3">{n.publisher}</span>
                      </a>
                    )) : <p className="text-xs text-ink-3">{cards ? "No local headlines matched yet." : "Loading the local news…"}</p>}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-[13px] text-ink-2">Being mapped from the latest local news; the next run fills it in.</p>
        )}
        {ins.length ? (<>{h3("Events feeding into it")}{ins.map((l) => { const f = famOf(l.aspect); return linkBtn(l.event.id, <FamIcon f={f} size={22} />, <><b className="font-semibold" style={{ color: FCOL(f) }}>{FNAME[f]}</b> · {ASPECTS[l.aspect].label}{l.via ? ` · via ${l.via}` : ""}{l.flow === "both" ? " · and back" : ""}</>); })}</>) : null}
        {outs.length ? (<>{h3("Where it ripples next")}{outs.map((l) => linkBtn(l.event.id, "→", <><b className="font-semibold" style={{ color: FCOL(famOf(l.aspect)) }}>{FNAME[famOf(l.aspect)]}</b> · {ASPECTS[l.aspect].label}{l.via ? ` · via ${l.via}` : ""}</>))}</>) : null}
        {shared.length ? (<>{h3("Shares a driver with")}{shared.map((l) => linkBtn(l.event.id, "┄", "Same driver: neither caused the other"))}</>) : null}
        {card?.recent?.length ? (
          <>{h3("Latest headlines")}{card.recent.slice(0, 5).map((n) => (
            <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="block border-t border-dashed border-line py-1.5 text-[13.5px] text-ink no-underline hover:underline">{n.title} <span className="text-xs text-ink-3">{n.publisher}</span></a>
          ))}</>
        ) : null}
      </div>
    );
  };

  /* ---- one connection, told simply: the hook and the first step free, the rest in the report ---- */
  const connView = (c: { a: string; b: string; back: string | null }) => {
    const l = links[c.a]?.find((x) => x.event.id === c.b);
    if (!l) return null;
    const dashed = isDash(l.kind);
    const [from, to] = l.flow === "in" ? [c.b, c.a] : [c.a, c.b];
    const f = famOf(l.aspect);
    const ex = teaserFor(c.a, c.b);
    const first = ex?.first ?? l.why;
    const more = ex?.more ?? 0;
    const hidden = more + (ex?.watch ? 1 : 0);
    const arrow = dashed ? "┄" : l.flow === "both" ? "⇄" : "→";
    const evBtn = (id: string) => (
      <button type="button" onClick={() => select(id)} className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-2 text-left hover:border-ink-3">
        <span className="block text-[13px] font-medium leading-snug">{G.at[id].e.title}</span>
        <span className="block text-[11px] text-gold">open ↗</span>
      </button>
    );
    return (
      <div>
        <button type="button" onClick={() => (c.back ? select(c.back) : select(null))} className="mb-2 text-[13px] text-ink-2 hover:text-ink">
          ← {c.back ? short(G.at[c.back].e.title, 40) : "Back"}
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2" style={{ fontFamily: "var(--font-sans)" }}>How they connect</p>
        <div className="mt-2 flex items-stretch gap-2">
          {evBtn(from)}
          <span className="flex items-center text-lg text-gold" aria-label={dashed ? "share a driver" : l.flow === "both" ? "both ways" : "leads to"}>{arrow}</span>
          {evBtn(to)}
        </div>
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          {dashed ? (
            <span>Same driver: neither caused the other.</span>
          ) : (
            <>
              <FamIcon f={f} size={20} />
              <span><b className="font-semibold" style={{ color: FCOL(f) }}>{FNAME[f]}</b> · {ASPECTS[l.aspect].label}{l.via ? ` · moves in: ${l.via}` : ""}</span>
            </>
          )}
        </p>
        <p className="mt-3 font-serif text-[21px] leading-snug">{ex?.hook ?? l.why}</p>
        <ol className="mt-3 space-y-2">
          <li className="flex gap-2.5 text-[14.5px] leading-snug">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-[13px] font-semibold text-paper">1</span>
            <span>{first}</span>
          </li>
        </ol>
        {hidden ? (
          <div className="relative mt-2 overflow-hidden rounded-lg border border-line">
            {/* the rest of the chain is in the report: placeholders only, the text is not on this page */}
            <div className="space-y-2.5 p-3 opacity-60 blur-[1.5px]" aria-hidden>
              {Array.from({ length: hidden }).map((_, n) => (
                <div key={n} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[12px] text-ink-3">{n < more ? n + 2 : "!"}</span>
                  <span className="h-2.5 rounded bg-line" style={{ width: `${70 - n * 12}%` }} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper/70 px-3 text-center">
              <p className="text-[13px] font-medium">
                {more > 0 ? `${more} more step${more > 1 ? "s" : ""}` : "The rest"}
                {ex?.watch ? " and what to watch next" : ""} {more === 1 && !ex?.watch ? "is" : "are"} in the report.
              </p>
              <a href={`${eventHref(from)}#read=connect&via=${to}`} className="inline-flex items-center rounded-sm bg-teal px-3 py-1.5 text-[13px] font-semibold text-paper no-underline hover:opacity-90">
                Read the whole chain →
              </a>
            </div>
          </div>
        ) : null}
        <button type="button" onClick={() => { select(from); setTimeout(() => setBuilding(true), 50); }} className="mt-3 text-[13px] text-gold hover:underline">
          Build a report on {short(G.at[from].e.title, 44)} →
        </button>
      </div>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "events", label: "Events" },
    ...(following ? [{ id: "following" as Tab, label: "Following" }] : []),
    ...(extraTab ? [{ id: "extra" as Tab, label: extraTab.label }] : []),
  ];
  const listBody = () => {
    if (tab === "today")
      return (
        <div data-spotlight="today">
          <p className="mb-1 text-[13px] text-ink-2">Today&rsquo;s ripples: the events moving most on the wire. The coloured dots beside each name are what is fueling it.</p>
          {today.map((t, i) => (
            <div key={t.id}>{row(t.id, i + 1)}<p className="-mt-1 mb-1.5 pl-8 text-xs text-ink-3">{short(t.headline, 120)}</p></div>
          ))}
        </div>
      );
    if (tab === "events") {
      const fresh = EVENTS.filter((e) => newSet.has(e.id)).sort((a, b) => Date.parse(b.auto!.addedAt) - Date.parse(a.auto!.addedAt));
      const list = [...EVENTS].filter((e) => !newSet.has(e.id)).sort((a, b) => Number(a.status === "scheduled") - Number(b.status === "scheduled") || b.severity - a.severity);
      return (
        <>
          {fresh.length ? (
            <div className="mb-3 rounded-lg border px-1.5 pb-1 pt-2" style={{ borderColor: "var(--new)" }}>
              <p className="mb-0.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--new)" }}>New on the map · {fresh.length}</p>
              <p className="mb-1 px-1.5 text-xs text-ink-2">Added from the news in the last {NEW_DAYS} days, newest first.</p>
              {fresh.map((e) => row(e.id))}
            </div>
          ) : null}
          <p className="mb-1 text-[13px] text-ink-2">{list.length} {fresh.length ? "more " : ""}events: live ones by severity, then what&rsquo;s coming up.</p>
          {list.map((e) => row(e.id))}
        </>
      );
    }
    if (tab === "following") {
      const list = (following ?? []).filter((id) => G.at[id]);
      return list.length ? <><p className="mb-1 text-[13px] text-ink-2">What you follow. Your tracker shows what changed since you last looked.</p>{list.map((id) => row(id))}</> : <p className="text-[13px] text-ink-2">Nothing followed yet. Open an event and press <b>Follow</b>.</p>;
    }
    return extraTab?.content ?? null;
  };

  /* the phone's bottom sheet: tap the handle to step through its heights, or drag it */
  const H0 = height ?? 800;
  const rest = { peek: PEEK, half: Math.round(H0 * 0.46), full: Math.round(H0 * 0.85) };
  const sheetPx = sheetDrag ?? rest[sheet];
  const sheetStart = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const sheetDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    sheetStart.current = { y: ev.clientY, h: sheetPx, moved: false };
  };
  const sheetMove = (ev: React.PointerEvent) => {
    const st = sheetStart.current;
    if (!st) return;
    const dy = ev.clientY - st.y;
    if (Math.abs(dy) > 6) st.moved = true;
    if (st.moved) setSheetDrag(Math.min(rest.full, Math.max(PEEK, st.h - dy)));
  };
  const sheetUp = (ev: React.PointerEvent) => {
    const st = sheetStart.current;
    sheetStart.current = null;
    if (!st) return;
    if (!st.moved) {
      setSheet((cur) => (cur === "peek" ? "half" : cur === "half" ? "full" : "peek"));
      return;
    }
    const h = Math.min(rest.full, Math.max(PEEK, st.h - (ev.clientY - st.y)));
    const near = (Object.keys(rest) as (keyof typeof rest)[]).reduce((a, b) => (Math.abs(rest[a] - h) < Math.abs(rest[b] - h) ? a : b));
    setSheet(near);
    setSheetDrag(null);
  };

  /* ---- the key ---- */
  const slim = learn.L.learned && !keyOpen;
  const keyBox = (
    <div
      data-spotlight="key"
      onPointerEnter={() => learn.L.learned && setKeyOpen(true)}
      onPointerLeave={() => { setKeyOpen(false); setLit(null); }}
      className={`absolute z-[16] border border-line shadow-[var(--shadow)] ${mobile ? "left-1/2 -translate-x-1/2 rounded-full bg-paper/90 px-1 py-0.5 backdrop-blur" : `bottom-5 left-[62px] rounded-xl bg-paper ${slim ? "px-2.5 py-1.5" : "w-[318px] px-3 py-2.5"}`}`}
      style={mobile ? { bottom: sheetPx + 8, display: sheetPx > (height ?? 800) * 0.6 ? "none" : undefined, transition: sheetDrag === null ? "bottom .2s" : undefined } : undefined}
      aria-label="Key"
    >
      {!mobile && !slim ? (
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          <span>{learn.L.learned ? "Key" : "What moves between events"}</span>
          <button type="button" onClick={learn.reset} className="text-[11px] font-normal normal-case tracking-normal text-ink-3 hover:text-ink">{learn.L.learned ? "learn again" : "reset"}</button>
        </div>
      ) : null}
      <div className={mobile ? "flex gap-0.5" : slim ? "flex justify-between gap-1" : ""}>
        {FAMS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={brush === f}
            onClick={() => { setBrush((b) => (b === f ? null : f)); learn.expose(f, "key"); }}
            onPointerEnter={() => !brush && setLit(f)}
            className={`flex items-center border text-left transition-colors ${mobile ? "gap-1.5 rounded-full py-1 pl-1 pr-2.5" : `gap-2 rounded-lg px-1.5 py-1 ${slim ? "" : "w-full"}`} ${lit === f || brush === f ? "border-ink-3 bg-paper-2" : "border-transparent hover:bg-paper-2"}`}
          >
            <FamIcon f={f} size={mobile ? 20 : 24} />
            <span className="min-w-0">
              <b className={`${mobile ? "text-[13px]" : "text-[13.5px]"} font-semibold`}>{FNAME[f]}</b>
              {!mobile && !slim ? <span className="block text-xs leading-snug text-ink-2">{FWHAT[f]}</span> : null}
            </span>
            {!slim && !mobile ? (
              <span className="ml-auto flex shrink-0 gap-[3px] pl-1" title={learn.knows(f) ? "Learned" : `Seen ${learn.L.seen[f]} of 3`}>
                {[0, 1, 2].map((i) => <i key={i} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: learn.L.seen[f] > i || learn.L.learned ? "var(--ink-2)" : "var(--line)" }} />)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {!mobile && !slim ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-1.5 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--gold)", boxShadow: "0 0 6px var(--gold)" }} />severe</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--other)" }} />developing</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--gold)" }} />coming up</span>
          {newSet.size ? <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ boxShadow: "0 0 0 2px var(--new)" }} />new this week</span> : null}
          <span className="flex items-center gap-1.5"><svg width="24" height="8" aria-hidden><path d="M0 4h18" stroke="var(--gold)" strokeWidth="1.6" /><path d="M17 1l6 3-6 3z" fill="var(--gold)" /></svg>ripples into</span>
          <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><path d="M0 4h22" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>same driver</span>
        </div>
      ) : null}
      {learn.quiz && !mobile ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="mb-1.5 text-[13px] font-semibold">Quick check: which colour is {FNAME[learn.quiz.ans]}?</p>
          <div className="flex gap-2">
            {learn.quiz.opts.map((f) => (
              <button key={f} type="button" aria-label={FNAME[f]} onClick={() => learn.answer(f)} className="h-8 w-8 rounded-full border-2 border-paper ring-1 ring-line" style={{ background: FCOL(f) }} />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">{learn.quiz.msg ?? "Get it right and the labels step back."}</p>
        </div>
      ) : null}
    </div>
  );

  const chip = (on: boolean) => `flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 text-[13px] ${on ? "bg-paper" : "bg-transparent text-ink-3"}`;

  return (
    <div ref={wrap} className="relative w-full overflow-hidden bg-paper" style={{ height: height ?? "calc(100svh - 64px)" }}>
      <FamilyDefs />
      <svg
        ref={svgRef}
        data-spotlight="map"
        viewBox={vb.join(" ")}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "grab" }}
        role="img"
        aria-label="World map of events and how they connect. The Events tab in the panel lists the same events."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setTip(null)}
      >
        <path d={G.sphere} fill="var(--sea)" stroke="var(--sphere)" vectorEffect="non-scaling-stroke" />
        <path d={G.grat} fill="none" stroke="var(--grat)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <path d={G.land} fill="var(--land)" stroke="var(--land-line)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
        {edgeEls}
        {topEls}
        {hitEls}
        {dots}
        {pills}
        {labels}
        {sats}
      </svg>

      {/* search and layers */}
      <div className={`absolute top-3 z-[17] flex items-center gap-2 md:right-[420px] ${mobile ? "left-2.5 right-2.5" : "left-4 right-4 flex-wrap"}`}>
        <div className="relative min-w-0 flex-1 md:max-w-[380px]">
          <svg className="absolute left-3 top-[11px] text-ink-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" && hits[0]) { select(hits[0].id); setQ(""); } if (ev.key === "Escape") setQ(""); }}
            placeholder="Search events, places…"
            aria-label="Search events"
            className="h-9 w-full rounded-full border border-line bg-paper pl-8 pr-3 text-sm text-ink placeholder:text-ink-3"
          />
          {q.trim() ? (
            <div className="absolute left-0 right-0 top-10 overflow-hidden rounded-lg border border-line bg-paper shadow-[var(--shadow)]">
              {hits.length ? hits.map((e) => (
                <button key={e.id} type="button" onClick={() => { select(e.id); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2">
                  {e.title} <span className="text-xs text-ink-3">· {e.region}</span>
                </button>
              )) : <p className="px-3 py-2 text-xs text-ink-3">No match</p>}
            </div>
          ) : null}
        </div>
        {mobile ? (
          <div className="relative">
            <button type="button" aria-expanded={layersOpen} aria-label="Map layers" onClick={() => setLayersOpen((o) => !o)} className={chip(layersOpen)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3 2.5 8 12 13l9.5-5z" /><path d="m2.5 12.5 9.5 5 9.5-5" /></svg>
            </button>
            {layersOpen ? (
              <div className="absolute right-0 top-10 z-30 flex w-44 flex-col gap-1.5 rounded-xl border border-line bg-paper p-2 shadow-[var(--shadow)]" role="group" aria-label="Map layers">
                <button type="button" aria-pressed={layers.lines} onClick={() => setLayers((l) => ({ ...l, lines: !l.lines }))} className={chip(layers.lines)}>
                  <svg width="16" height="8" aria-hidden><path d="M0 4h16" stroke="currentColor" strokeWidth="2" /></svg>Ripples
                </button>
                <button type="button" aria-pressed={layers.fuel} onClick={() => setLayers((l) => ({ ...l, fuel: !l.fuel }))} className={chip(layers.fuel)}>
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "conic-gradient(var(--money) 0 33%, var(--goods) 0 66%, var(--people) 0)" }} />Fuel
                </button>
                <button type="button" aria-pressed={layers.pulse} onClick={() => setLayers((l) => ({ ...l, pulse: !l.pulse }))} className={chip(layers.pulse)}>
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--gold)" }} />Pulse
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-1.5" role="group" aria-label="Map layers">
          {mobile ? null : (
            <>
          <button type="button" aria-pressed={layers.lines} onClick={() => setLayers((l) => ({ ...l, lines: !l.lines }))} className={chip(layers.lines)}>
            <svg width="16" height="8" aria-hidden><path d="M0 4h16" stroke="currentColor" strokeWidth="2" /></svg>Ripples
          </button>
          <button type="button" aria-pressed={layers.fuel} onClick={() => setLayers((l) => ({ ...l, fuel: !l.fuel }))} className={chip(layers.fuel)}>
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "conic-gradient(var(--money) 0 33%, var(--goods) 0 66%, var(--people) 0)" }} />Fuel
          </button>
          <button type="button" aria-pressed={layers.pulse} onClick={() => setLayers((l) => ({ ...l, pulse: !l.pulse }))} className={chip(layers.pulse)}>
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--gold)" }} />Pulse
          </button>
            </>
          )}
          {newSet.size ? (
            <button
              type="button"
              aria-pressed={newOnly}
              title="Show only the events added from the news this week"
              onClick={() => { const on = !newOnly; setNewOnly(on); if (on) { select(null); world(); setTab("events"); if (mobile && sheet === "peek") setSheet("half"); } }}
              className={chip(newOnly)}
              style={newOnly ? { background: "var(--new)", borderColor: "var(--new)", color: "var(--paper)", fontWeight: 600 } : { borderColor: "var(--new)", color: "var(--new)" }}
            >
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: newOnly ? "var(--paper)" : "var(--new)" }} />{newSet.size} new
            </button>
          ) : null}
        </div>
      </div>

      {/* zoom */}
      <div className={`absolute z-[15] flex flex-col gap-1.5 ${mobile ? "right-2.5 top-[58px]" : "bottom-5 left-4"}`}>
        {/* on a phone, pinch and double-tap zoom; only "whole world" needs a button */}
        {(mobile ? [["⟲", "Whole world", () => { select(null); world(); }]] : [["+", "Zoom in", () => zoomBy(1.6)], ["−", "Zoom out", () => zoomBy(1 / 1.6)], ["⟲", "Whole world", () => { select(null); world(); }]]).map(([t, l, fn]) => (
          <button key={l as string} type="button" aria-label={l as string} onClick={fn as () => void} className="h-9 w-9 rounded-lg border border-line bg-paper text-lg shadow-[var(--shadow)]">{t as string}</button>
        ))}
      </div>

      {keyBox}

      {/* the panel: beside the map on a desk, a bottom sheet on a phone */}
      <aside
        ref={panelRef}
        aria-label="Event panel"
        className={`absolute z-[18] flex flex-col overflow-hidden border border-line bg-paper shadow-[var(--shadow)] ${mobile ? "inset-x-0 bottom-0 rounded-t-2xl transition-[height] duration-200" : "bottom-4 right-4 top-4 w-[392px] rounded-2xl"}`}
        style={mobile ? { height: sheetPx, transition: sheetDrag === null ? "height .2s" : "none" } : undefined}
      >
        {mobile ? (
          <button
            type="button"
            aria-label={sheet === "full" ? "Lower the panel" : "Raise the panel"}
            onPointerDown={sheetDown}
            onPointerMove={sheetMove}
            onPointerUp={sheetUp}
            className="w-full touch-none pb-1 pt-2.5"
          >
            <i className="mx-auto block h-[5px] w-10 rounded-full bg-line" />
            {sheet === "peek" && !sel ? <span className="mt-1 block text-[11px] text-ink-3">Swipe up for today&rsquo;s ripples</span> : null}
          </button>
        ) : null}
        <div className="flex shrink-0 border-b border-line" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); select(null); if (mobile && sheet === "peek") setSheet("half"); }} className={`flex-1 border-b-2 px-1 py-2.5 text-[13px] ${tab === t.id && !sel ? "border-gold font-semibold text-ink" : tab === t.id ? "border-gold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div ref={panelBody} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3.5">{conn ? connView(conn) : sel ? eventView(sel) : listBody()}</div>
      </aside>

      {pick ? (
        <div className="absolute z-40 w-[280px] rounded-lg border border-line bg-paper p-1.5 shadow-[var(--shadow)]" style={{ left: Math.max(8, Math.min(pick.x - 140, box.w - 288)), top: Math.max(8, pick.y + 12) }}>
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Which connection?</p>
          {pick.pairs.map((k) => {
            const [a, b] = k.split("~");
            return (
              <button key={k} type="button" onClick={() => { setPick(null); openConn(a, b, sel); }} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-paper-2">
                <span className="block text-[13px] font-medium leading-snug">{short(G.at[a].e.title, 34)} · {short(G.at[b].e.title, 34)}</span>
                <span className="block text-xs text-ink-2">{teaserFor(a, b)?.hook ?? ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {tip && !pick ? (
        <div className="pointer-events-none absolute z-40 max-w-[270px] rounded-md bg-ink px-2.5 py-1.5 text-xs leading-snug text-paper" style={{ left: Math.min(tip.x + 14, box.w - 285), top: tip.y + 14 }}>
          {tip.html}
        </div>
      ) : null}
    </div>
  );
}
