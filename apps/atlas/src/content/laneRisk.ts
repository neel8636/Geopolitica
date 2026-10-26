import { POINT_BY_ID, type Route } from "./lanes.ts";
import { EFFECTS, tagsByPoint, type LaneEffect, type LaneFeed, type LaneFeedEvent, type LaneHeadline } from "./laneTags.ts";

/*
  Which route costs more once today's events are counted, and what to do about it.

  For each route, every event tagged to a point on it counts once (at the point where it bites
  hardest). With p the event's likelihood, delay and cost its mid-range delay days and extra
  freight percent:
    chance of disruption       1 - Π(1 - p)
    expected delay (days)      Σ p · delay
    expected extra cost        freight · Σ p · cost% + (cost of a late day + carrying cost a day) · Σ p · delay
    expected cost per shipment freight + carrying cost a day · transit days + expected extra cost
  Carrying cost a day = cargo value · carrying rate / 365. The yearly figure multiplies by the
  shipments a year. The customer's own freight quotes and transit days replace the library's
  starting values. Pure functions: the Lanes page runs them in the browser.
*/

export interface LaneInputs {
  shipmentsPerYear: number;
  baseFreight: number; // freight per shipment on the current route
  cargoValue: number; // value of the goods in one shipment
  carryRatePct: number; // yearly carrying cost of inventory, percent of value
  lateDayCost: number; // what one day late costs per shipment (expediting, overtime, line risk)
  current: string; // the route used today
  freight: Record<string, number>; // per-route overrides
  days: Record<string, number>; // per-route overrides
}

export interface RouteHit {
  event: LaneFeedEvent;
  point: string;
  pointName: string;
  effect: LaneEffect;
  effectLabel: string;
  likelihood: number;
  delayDays: [number, number];
  costPct: [number, number];
  why: string;
  action: string;
  headlines: LaneHeadline[];
}

export type RiskLevel = "low" | "medium" | "high";
export const RISK_LABEL: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export interface RouteAssessment {
  route: Route;
  freight: number;
  days: number;
  freightIsEstimate: boolean;
  hits: RouteHit[];
  chance: number; // 0-1
  expDelay: number; // days per shipment
  expExtra: number; // per shipment
  perShipment: number; // expected total logistics cost per shipment
  perYear: number;
  extraPerYear: number;
  level: RiskLevel;
}

export interface LaneAssessment {
  routes: RouteAssessment[];
  current: RouteAssessment | undefined;
  cheapest: RouteAssessment | undefined; // lowest expected cost
  safest: RouteAssessment | undefined; // lowest chance of disruption
  savingPerYear: number; // current minus cheapest, expected
  actions: string[];
}

const mid = ([a, b]: [number, number]) => (a + b) / 2;

export function levelOf(chance: number): RiskLevel {
  return chance >= 0.4 ? "high" : chance >= 0.15 ? "medium" : "low";
}

export function routeHits(route: Route, feed: LaneFeed): RouteHit[] {
  const byPoint = tagsByPoint(feed, route.mode);
  const best = new Map<string, RouteHit>();
  for (const point of route.points) {
    for (const { event, tag } of byPoint.get(point) ?? []) {
      const weight = tag.likelihood * (mid(tag.delayDays) + mid(tag.costPct) / 10);
      const have = best.get(event.id);
      if (have && have.likelihood * (mid(have.delayDays) + mid(have.costPct) / 10) >= weight) continue;
      best.set(event.id, {
        event,
        point,
        pointName: POINT_BY_ID[point]?.name ?? point,
        effect: tag.effect,
        effectLabel: EFFECTS[tag.effect],
        likelihood: tag.likelihood,
        delayDays: tag.delayDays,
        costPct: tag.costPct,
        why: tag.why,
        action: tag.action,
        headlines: tag.sources.map((i) => event.headlines[i]).filter(Boolean),
      });
    }
  }
  return [...best.values()].sort((a, b) => b.likelihood - a.likelihood);
}

export function assessLane(routes: Route[], feed: LaneFeed, inp: LaneInputs): LaneAssessment {
  if (!routes.length) return { routes: [], current: undefined, cheapest: undefined, safest: undefined, savingPerYear: 0, actions: [] };
  const currentRoute = routes.find((r) => r.id === inp.current) ?? routes[0];
  const carryPerDay = (Math.max(0, inp.cargoValue) * Math.max(0, inp.carryRatePct)) / 100 / 365;
  const n = Math.max(0, inp.shipmentsPerYear);

  const out: RouteAssessment[] = routes.map((route) => {
    const own = inp.freight[route.id];
    const freight = own !== undefined && own >= 0 ? own : Math.max(0, inp.baseFreight) * (route.costIndex / currentRoute.costIndex);
    const days = inp.days[route.id] !== undefined && inp.days[route.id] >= 0 ? inp.days[route.id] : route.days;
    const hits = routeHits(route, feed);
    const chance = 1 - hits.reduce((s, h) => s * (1 - h.likelihood), 1);
    const expDelay = hits.reduce((s, h) => s + h.likelihood * mid(h.delayDays), 0);
    const expCostPct = hits.reduce((s, h) => s + h.likelihood * mid(h.costPct), 0);
    const expExtra = (freight * expCostPct) / 100 + (Math.max(0, inp.lateDayCost) + carryPerDay) * expDelay;
    const perShipment = freight + carryPerDay * days + expExtra;
    return {
      route,
      freight,
      days,
      freightIsEstimate: own === undefined && route.id !== currentRoute.id,
      hits,
      chance,
      expDelay,
      expExtra,
      perShipment,
      perYear: perShipment * n,
      extraPerYear: expExtra * n,
      level: levelOf(chance),
    };
  });

  const current = out.find((a) => a.route.id === currentRoute.id);
  const cheapest = [...out].sort((a, b) => a.perShipment - b.perShipment)[0];
  const safest = [...out].sort((a, b) => a.chance - b.chance || a.perShipment - b.perShipment)[0];
  const savingPerYear = current && cheapest ? current.perYear - cheapest.perYear : 0;
  return { routes: out, current, cheapest, safest, savingPerYear, actions: mitigation(out, current, cheapest, safest, savingPerYear, n) };
}

const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const days1 = (x: number) => (Math.round(x * 10) / 10).toString();

function mitigation(all: RouteAssessment[], current: RouteAssessment | undefined, cheapest: RouteAssessment | undefined, safest: RouteAssessment | undefined, saving: number, n: number): string[] {
  const out: string[] = [];
  if (!current) return out;
  const pct = current.perYear > 0 ? saving / current.perYear : 0;
  if (cheapest && cheapest !== current && pct > 0.03) {
    const dd = cheapest.days - current.days;
    out.push(
      `Move this lane to "${cheapest.route.label}": about ${money(saving)} a year less in expected cost${dd ? `, ${Math.abs(dd)} days ${dd > 0 ? "longer" : "shorter"} in transit` : ""}. Get a firm quote first, since the freight on that route is ${cheapest.freightIsEstimate ? "our estimate" : "your figure"}.`,
    );
  } else if (current.level !== "low" && safest && safest !== current && safest.chance < current.chance - 0.1) {
    out.push(
      `Split the volume: send part of it via "${safest.route.label}" (${Math.round(safest.chance * 100)}% chance of disruption against ${Math.round(current.chance * 100)}% on your route) so one closure cannot stop the whole flow.`,
    );
  }
  const real = current.hits.filter((h) => h.likelihood >= 0.25);
  if (current.expDelay >= 0.5) {
    // enough stock to ride out the longest likely delay, not the sum of every possible one
    const buffer = Math.ceil(real.length ? Math.max(...real.map((h) => h.delayDays[1])) : current.expDelay);
    out.push(`Hold about ${buffer} extra days of stock for the parts on this lane while ${(real[0] ?? current.hits[0])?.event.title ?? "these events"} lasts.`);
  }
  // the event-specific steps Claude suggested, for the points on the current route that are likely to bite
  for (const h of real.slice(0, 3)) if (h.action) out.push(`${h.pointName}: ${h.action}`);
  if (current.hits.some((h) => h.effect === "security" || h.effect === "closure") && current.route.mode === "sea") {
    out.push("Check with your forwarder whether war-risk and emergency surcharges are already in your rate, and how long the quote holds.");
  }
  if (current.hits.some((h) => h.effect === "border")) {
    out.push("Have customs paperwork filed before the truck reaches the border, and ask your broker which crossing is moving fastest this week.");
  }
  if (!current.hits.length) {
    const risky = all.filter((a) => a !== current && a.level !== "low");
    out.push(
      all.every((a) => !a.hits.length)
        ? "No event on the map touches these routes today. Keep your route; the check runs every hour, so look again before you book."
        : `No event on the map touches your route today: keep it.${risky.length ? ` Do not switch to ${risky.map((a) => `"${a.route.label}"`).join(" or ")} while ${risky[0].hits[0]?.event.title ?? "the events on it"} lasts.` : ""}`,
    );
    out.push("Get a backup quote on the next-cheapest route now, so you can switch within days if something changes.");
  }
  if (n > 0 && current.extraPerYear > 0 && out.length < 6) {
    out.push(`Budget about ${money(current.extraPerYear)} a year (${money(current.expExtra)} a shipment) for disruption on your current route, ${days1(current.expDelay)} days of delay a shipment on average.`);
  }
  return [...new Set(out)].slice(0, 6);
}
