import type { WorldEvent } from "./events.ts";
import { MODE_LABEL, KIND_LABEL, POINT_BY_ID, TAGGABLE, type Mode } from "./lanes.ts";

/*
  Which route points each event disrupts. Claude reads an event, its latest "what changed" line
  and its headlines, and names the ports, canals, straits, border crossings, airports, airspace
  and rail corridors it puts at risk in the next 30 days, with how likely, how many days of delay
  and how much extra freight cost if it happens, why, and one thing a shipper can do about it.

  Pure functions: the pipeline (scripts/lanetags.mjs) talks to the API and writes
  src/content/lane-tags.json; the Atlas publishes it with the events as /lanes.json, which the
  enterprise edition's Lanes page reads.
*/

export type LaneEffect = "closure" | "delay" | "surcharge" | "border" | "capacity" | "security";
export const EFFECTS: Record<LaneEffect, string> = {
  closure: "Closed or being avoided",
  delay: "Delays",
  surcharge: "Extra charges",
  border: "Border and customs friction",
  capacity: "Less capacity",
  security: "Security risk",
};

export interface LaneHeadline {
  title: string;
  url: string;
  publisher: string;
  published: string;
}

export interface LaneTag {
  point: string; // a route point id (lanes.ts)
  effect: LaneEffect;
  likelihood: number; // 0-1: chance shipments through the point are delayed, rerouted or charged extra in the next 30 days
  delayDays: [number, number]; // extra days if it happens, low-high
  costPct: [number, number]; // extra freight cost in percent if it happens, low-high
  why: string; // one sentence, plain, dated
  action: string; // one thing a shipper using this point can do
  sources: number[]; // indexes into the entry's headlines
}

export interface LaneTagEntry {
  at: string; // ISO, when Claude last looked
  by: string;
  hash: string; // of what Claude was shown about the event, so a change triggers a fresh look
  tags: LaneTag[];
  headlines: LaneHeadline[]; // the ones the tags cite
}

export type LaneTagFile = Record<string, LaneTagEntry>;

/* A short fingerprint of what the event says now (cheap, stable, not cryptographic). */
export function eventHash(e: WorldEvent, update?: string): string {
  const s = `${e.date}|${e.status}|${e.severity}|${e.summary}|${update ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const catalog = () =>
  TAGGABLE.map((p) => `${p.id} | ${p.name} | ${KIND_LABEL[p.kind]} | ${p.modes.map((m) => MODE_LABEL[m]).join("/")} | ${p.countries.join(",") || "-"}`).join("\n");

export const LANE_SYSTEM = `You help manufacturers see how world events hit the routes their freight takes. You are given one event and a catalogue of route points: ports, canals, straits, sea areas, border crossings, ferries, airports, airspace and rail corridors.

Name the route points this event is likely to disrupt in the next 30 days for freight moving THROUGH them, and nothing else.

Rules:
- Be conservative. Most events touch no route point; then return {"tags": []}. Never tag a point for a loose regional link.
- Tag a point only when the material describes, or the event clearly implies, a physical or procedural effect on freight passing it: attacks or threats to shipping, a closure or diversion, a strike or blockade at the point, a border shutdown or new checks at the crossing, airspace closure, sanctions that stop transit through it, weather or water levels that cut capacity.
- Tariffs, quotas and product rules apply whatever the route, so they are NOT route points, unless they change processing at a specific border crossing.
- An election, unrest or a budget fight in a country affects its ports and crossings only when strikes, blockades or closures there are reported or credibly scheduled.
- likelihood (0 to 1): the chance shipments through the point are delayed, rerouted or charged extra in the next 30 days because of this event. An ongoing closure or diversion is 0.85 to 1. A credible threat is 0.2 to 0.5. A remote possibility does not get a tag.
- delayDays [low, high]: extra days per shipment if it happens. For a forced diversion, the typical extra days of the way round.
- costPct [low, high]: extra freight cost in percent if it happens (surcharges, war-risk premiums, diversions, waiting). 0 when only time is lost.
- why: one plain sentence with dates, saying what is happening at the point and why freight is affected.
- action: one concrete step for a shipper who uses this point (book an alternative, pre-file customs, add buffer stock of N days, ask the forwarder for X). No generic advice.
- sources: indexes of the headlines that support the tag; at least one when the tag rests on the headlines.
- effect: one of closure, delay, surcharge, border, capacity, security.
- Use only point ids from the catalogue, exactly as written. At most 8 tags.

Reply with JSON only, no fences, no commentary:
{"tags": [{"point": "...", "effect": "...", "likelihood": 0.0, "delayDays": [0, 0], "costPct": [0, 0], "why": "...", "action": "...", "sources": [0]}]}`;

export function lanePrompt(e: WorldEvent, headlines: LaneHeadline[], update?: string, today = new Date().toISOString().slice(0, 10)): string {
  const lines = [
    `TODAY: ${today}`,
    `EVENT: ${e.title} (${e.region}; ${e.status}; latest development ${e.date}; severity ${e.severity}/5)`,
    `COUNTRIES: ${e.countries.join(", ")}`,
    `SUMMARY: ${e.summary}`,
  ];
  if (update) lines.push(`LATEST "WHAT CHANGED" LINE: ${update}`);
  lines.push("HEADLINES (index: title, publisher, date):");
  headlines.forEach((h, i) => lines.push(`${i}: ${h.title} (${h.publisher}, ${h.published.slice(0, 10)})`));
  if (!headlines.length) lines.push("(none in the last week)");
  lines.push("", "ROUTE POINTS (id | name | kind | modes | countries):", catalog());
  return lines.join("\n");
}

const clamp = (n: unknown, lo: number, hi: number) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
};
const range = (v: unknown, lo: number, hi: number): [number, number] => {
  const a = Array.isArray(v) ? v : [v, v];
  const x = clamp(a[0], lo, hi);
  const y = clamp(a[1] ?? a[0], lo, hi);
  return x <= y ? [x, y] : [y, x];
};
const text = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/* Keep only what is well formed and real: known points, sane numbers, existing headlines. */
export function finishLaneTags(raw: unknown, headlines: LaneHeadline[]): { tags: LaneTag[]; headlines: LaneHeadline[] } {
  const list = Array.isArray((raw as { tags?: unknown })?.tags) ? ((raw as { tags: unknown[] }).tags) : [];
  const out: LaneTag[] = [];
  for (const t of list as Record<string, unknown>[]) {
    const point = String(t?.point ?? "").trim().toUpperCase();
    const p = POINT_BY_ID[point];
    if (!p || p.kind === "waypoint" || out.some((x) => x.point === point)) continue;
    const effect = (Object.keys(EFFECTS) as LaneEffect[]).includes(t.effect as LaneEffect) ? (t.effect as LaneEffect) : "delay";
    const likelihood = Math.round(clamp(t.likelihood, 0, 1) * 100) / 100;
    if (likelihood < 0.05) continue;
    const why = text(t.why, 280);
    const action = text(t.action, 220);
    if (!why) continue;
    const sources = (Array.isArray(t.sources) ? t.sources : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < headlines.length);
    out.push({ point, effect, likelihood, delayDays: range(t.delayDays, 0, 60), costPct: range(t.costPct, 0, 300), why, action, sources: [...new Set(sources)] });
    if (out.length >= 8) break;
  }
  // keep only the cited headlines, renumbered
  const used = [...new Set(out.flatMap((t) => t.sources))].sort((a, b) => a - b);
  const map = new Map(used.map((old, i) => [old, i]));
  for (const t of out) t.sources = t.sources.map((i) => map.get(i)!).filter((i) => i !== undefined);
  return { tags: out, headlines: used.map((i) => headlines[i]) };
}

// --- the feed the Lanes page reads -------------------------------------------------------------

export interface LaneFeedEvent {
  id: string;
  title: string;
  date: string;
  status: WorldEvent["status"];
  severity: WorldEvent["severity"];
  region: string;
  at: string; // when its route points were last checked
  tags: LaneTag[];
  headlines: LaneHeadline[];
}

export interface LaneFeed {
  at: string | null; // newest check
  checked: number; // events Claude has looked at
  events: LaneFeedEvent[]; // only those that touch at least one route point
}

export function buildLaneFeed(file: LaneTagFile, events: WorldEvent[]): LaneFeed {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out: LaneFeedEvent[] = [];
  let at: string | null = null;
  let checked = 0;
  for (const [id, entry] of Object.entries(file)) {
    const e = byId.get(id);
    if (!e) continue;
    checked++;
    if (!at || entry.at > at) at = entry.at;
    const tags = entry.tags.filter((t) => POINT_BY_ID[t.point]);
    if (!tags.length) continue;
    out.push({ id, title: e.title, date: e.date, status: e.status, severity: e.severity, region: e.region, at: entry.at, tags, headlines: entry.headlines });
  }
  out.sort((a, b) => b.severity - a.severity || a.title.localeCompare(b.title));
  return { at, checked, events: out };
}

/* Every tag on a route point, with its event: the lookup the risk scoring uses. */
export function tagsByPoint(feed: LaneFeed, mode?: Mode): Map<string, { event: LaneFeedEvent; tag: LaneTag }[]> {
  const m = new Map<string, { event: LaneFeedEvent; tag: LaneTag }[]>();
  for (const event of feed.events) {
    for (const tag of event.tags) {
      const p = POINT_BY_ID[tag.point];
      if (!p || (mode && !p.modes.includes(mode))) continue;
      (m.get(tag.point) ?? m.set(tag.point, []).get(tag.point)!).push({ event, tag });
    }
  }
  return m;
}
