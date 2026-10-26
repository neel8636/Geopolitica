// Run with: npm run test:lanes
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, PLACES, POINT_BY_ID, laneFor, placesFor } from "../src/content/lanes.ts";
import { buildLaneFeed, finishLaneTags } from "../src/content/laneTags.ts";
import { assessLane, levelOf } from "../src/content/laneRisk.ts";

const ev = (id, extra = {}) => ({
  id, title: `Event ${id}`, type: "conflict", date: "2026-10-20", status: "developing", region: "Somewhere",
  lat: 0, lon: 0, countries: ["EG"], summary: "s", severity: 4, keywords: [], links: [], sources: [], ...extra,
});

test("every pair of places in every mode builds without error, with sound routes", () => {
  for (const mode of MODES) {
    const places = placesFor(mode);
    let pairsWithRoutes = 0;
    for (const o of places) {
      for (const d of places) {
        if (o.id === d.id) continue;
        const lane = laneFor(o.id, d.id);
        assert.ok(lane, `${o.id} -> ${d.id} returned null`);
        if (lane.routes.length) pairsWithRoutes++;
        const ids = new Set();
        for (const r of lane.routes) {
          assert.ok(!ids.has(r.id), `duplicate route id ${r.id} on ${o.id} -> ${d.id}`);
          ids.add(r.id);
          for (const p of r.points) assert.ok(POINT_BY_ID[p], `unknown point ${p}`);
          assert.ok(r.days > 0 && r.km > 0, `bad distance or days on ${r.label}`);
          assert.ok(r.costIndex >= 1, `cost index below 1 on ${r.label}`);
          assert.ok(r.path.length >= 2);
        }
        if (lane.routes.length) assert.equal(Math.min(...lane.routes.map((r) => r.costIndex)), 1);
      }
    }
    // sea and air connect every pair; road and rail only where a crossing or corridor exists
    if (mode === "sea" || mode === "air") assert.equal(pairsWithRoutes, places.length * (places.length - 1), `${mode}: some pairs have no route`);
    else assert.ok(pairsWithRoutes > 0);
  }
});

test("Asia to Europe by sea offers Suez and the Cape", () => {
  const lane = laneFor("sea:SHANGHAI", "sea:ROTTERDAM");
  const labels = lane.routes.map((r) => r.label);
  assert.ok(labels.some((l) => l.includes("Suez")));
  assert.ok(labels.some((l) => l.includes("Cape of Good Hope")));
  const suez = lane.routes.find((r) => r.label === "Via Suez Canal");
  const cape = lane.routes.find((r) => r.label === "Via Cape of Good Hope");
  assert.ok(cape.days - suez.days >= 7 && cape.days - suez.days <= 15, "the Cape should add one to two weeks");
});

test("Asia to the US East Coast offers the West Coast plus rail", () => {
  const lane = laneFor("sea:SHANGHAI", "sea:NYNJ");
  assert.ok(lane.routes.some((r) => r.points.includes("US_RAIL")));
  assert.ok(lane.routes.some((r) => r.points.includes("PANAMA")));
});

test("modes do not mix", () => {
  assert.equal(laneFor("sea:SHANGHAI", "air:ORD"), null);
  assert.equal(laneFor("sea:SHANGHAI", "sea:SHANGHAI"), null);
  assert.equal(PLACES.filter((p) => !MODES.includes(p.mode)).length, 0);
});

test("tag checks drop unknown points, clamp numbers and renumber sources", () => {
  const heads = [0, 1, 2].map((i) => ({ title: `h${i}`, url: `https://x/${i}`, publisher: "P", published: "2026-10-20T00:00:00Z" }));
  const out = finishLaneTags(
    {
      tags: [
        { point: "suez", effect: "closure", likelihood: 1.4, delayDays: [14, 10], costPct: [20, 900], why: " Houthi attacks ", action: "Book via the Cape.", sources: [2, 9] },
        { point: "NOWHERE", effect: "delay", likelihood: 0.5, why: "x" },
        { point: "W_CRETE", effect: "delay", likelihood: 0.5, why: "waypoints are not tagged" },
        { point: "PANAMA", effect: "weird", likelihood: 0.01, why: "too unlikely" },
        { point: "SUEZ", effect: "delay", likelihood: 0.5, why: "duplicate" },
      ],
    },
    heads,
  );
  assert.equal(out.tags.length, 1);
  const t = out.tags[0];
  assert.equal(t.point, "SUEZ");
  assert.equal(t.likelihood, 1);
  assert.deepEqual(t.delayDays, [10, 14]);
  assert.deepEqual(t.costPct, [20, 300]);
  assert.equal(t.why, "Houthi attacks");
  assert.deepEqual(t.sources, [0]);
  assert.equal(out.headlines.length, 1);
  assert.equal(out.headlines[0].title, "h2");
  assert.deepEqual(finishLaneTags("nonsense", heads).tags, []);
});

test("a closed Suez Canal makes the Cape the cheaper expected route", () => {
  const file = {
    red: { at: "2026-10-26T10:00:00Z", by: "test", hash: "x", headlines: [], tags: [
      { point: "BAB_EL_MANDEB", effect: "security", likelihood: 0.9, delayDays: [10, 14], costPct: [20, 40], why: "Attacks on ships.", action: "Book via the Cape.", sources: [] },
      { point: "SUEZ", effect: "closure", likelihood: 0.6, delayDays: [5, 7], costPct: [5, 10], why: "Fewer transits.", action: "x", sources: [] },
    ] },
    gone: { at: "2026-10-26T10:00:00Z", by: "test", hash: "x", headlines: [], tags: [{ point: "SUEZ", effect: "closure", likelihood: 1, delayDays: [1, 1], costPct: [0, 0], why: "y", action: "", sources: [] }] },
    quiet: { at: "2026-10-26T11:00:00Z", by: "test", hash: "x", headlines: [], tags: [] },
  };
  const feed = buildLaneFeed(file, [ev("red"), ev("quiet")]);
  assert.equal(feed.checked, 2, "events no longer on the map are left out");
  assert.equal(feed.events.length, 1, "events with no tags are left out");
  assert.equal(feed.at, "2026-10-26T11:00:00Z");

  const lane = laneFor("sea:SHANGHAI", "sea:ROTTERDAM");
  const suez = lane.routes.find((r) => r.label === "Via Suez Canal");
  const cape = lane.routes.find((r) => r.label === "Via Cape of Good Hope");
  const a = assessLane(lane.routes, feed, {
    shipmentsPerYear: 50, baseFreight: 3000, cargoValue: 80000, carryRatePct: 20, lateDayCost: 1500, current: suez.id, freight: {}, days: {},
  });
  const s = a.routes.find((x) => x.route.id === suez.id);
  const c = a.routes.find((x) => x.route.id === cape.id);
  assert.equal(s.hits.length, 1, "one event counts once per route");
  assert.equal(s.hits[0].point, "BAB_EL_MANDEB", "at the point where it bites hardest");
  assert.ok(Math.abs(s.chance - 0.9) < 1e-9);
  assert.equal(c.hits.length, 0);
  assert.equal(s.level, "high");
  assert.equal(a.cheapest.route.id, cape.id);
  assert.ok(a.savingPerYear > 0);
  assert.ok(a.actions[0].startsWith("Move this lane"));
  assert.ok(a.actions.some((t) => t.startsWith("Hold about 14 extra days")), "buffer covers the longest likely delay");
  // a quiet route still gets advice
  const q = assessLane(lane.routes, feed, { shipmentsPerYear: 50, baseFreight: 3000, cargoValue: 80000, carryRatePct: 20, lateDayCost: 300, current: cape.id, freight: {}, days: {} });
  assert.ok(q.actions[0].startsWith("No event on the map touches your route today"));
  // freight on other routes scales from the current route's freight by the cost index
  assert.ok(Math.abs(c.freight - 3000 * (cape.costIndex / suez.costIndex)) < 1e-6);
  // the customer's own quote wins
  const b = assessLane(lane.routes, feed, { shipmentsPerYear: 50, baseFreight: 3000, cargoValue: 80000, carryRatePct: 20, lateDayCost: 1500, current: suez.id, freight: { [cape.id]: 9000 }, days: {} });
  assert.equal(b.routes.find((x) => x.route.id === cape.id).freight, 9000);
});

test("risk levels", () => {
  assert.equal(levelOf(0), "low");
  assert.equal(levelOf(0.15), "medium");
  assert.equal(levelOf(0.4), "high");
});
