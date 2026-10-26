#!/usr/bin/env node
// Lane risk: ask Claude which route points (ports, canals, straits, border crossings, airports,
// airspace, rail corridors) each event on the map disrupts, and keep the answers in
// src/content/lane-tags.json. The enterprise edition's Lanes page reads them (via /lanes.json)
// to score every route between two places.
//
//   npm run lanetags                 events never checked, events whose story changed (after 6 h)
//                                    and anything not checked for 48 h; never-checked first
//   npm run lanetags -- --max 8      cap per run (default 8)
//   npm run lanetags -- --all        check every event now, ignoring the timers
//   npm run lanetags -- --dry-run    list what would run
//
// Needs ANTHROPIC_API_KEY and src/content/wire.json (run `npm run wire` first).
// Failures from the latest run are written to src/content/lane-tags-errors.json.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "../src/content/events.ts";
import { DEFAULT_MODEL, extractJson } from "../src/content/drafting.ts";
import { LANE_SYSTEM, eventHash, finishLaneTags, lanePrompt } from "../src/content/laneTags.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(here, "..", "src", "content");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const MAX = Number(opt("--max", process.env.LANES_MAX || "8")) || 8;
const DRY = args.includes("--dry-run");
const ALL = args.includes("--all");
const MODEL = opt("--model", process.env.LANES_MODEL || DEFAULT_MODEL);
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.log("no ANTHROPIC_API_KEY: skipping lane tags");
  process.exit(0);
}

const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(path.join(CONTENT, f), "utf8"));
  } catch {
    return fallback;
  }
};
const wire = await readJson("wire.json", { fetchedAt: new Date().toISOString(), items: [] });
const updates = await readJson("updates.json", {});
const tags = await readJson("lane-tags.json", {});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.parse(wire.fetchedAt) || Date.now();
const names = (title, e) => e.keywords.some((k) => title.toLowerCase().includes(k.toLowerCase()));
const headlines = (e, days) =>
  wire.items
    .filter((i) => i.published !== wire.fetchedAt && (i.found === e.id || (i.eventIds.includes(e.id) && names(i.title, e))))
    .filter((i) => now - Date.parse(i.published) < days * DAY)
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .slice(0, 20)
    .map((i) => ({ title: i.title, url: i.url, publisher: i.publisher, published: i.published }));
const latestUpdate = (id) => {
  const list = Array.isArray(updates[id]) ? updates[id] : [];
  return [...list].sort((a, b) => (a.at < b.at ? 1 : -1))[0]?.text;
};

// events that left the map take their tags with them
for (const id of Object.keys(tags)) if (!EVENTS.some((e) => e.id === id)) delete tags[id];

const todo = EVENTS.map((e) => {
  const update = latestUpdate(e.id);
  const hash = eventHash(e, update);
  const last = tags[e.id];
  const age = last ? now - Date.parse(last.at) : Infinity;
  const due = ALL || !last || (last.hash !== hash && age > 6 * HOUR) || age > 48 * HOUR;
  return { e, update, hash, last, due };
})
  .filter((t) => t.due)
  .sort((a, b) => Number(Boolean(a.last)) - Number(Boolean(b.last)) || b.e.severity - a.e.severity);
const picked = todo.slice(0, MAX);
console.log(`${todo.length} events due for a route check; checking ${picked.length}`);
for (const t of picked) console.log(`  ${t.last ? "re-check" : "new     "}  ${t.e.title}`);
if (DRY || !picked.length) process.exit(0);

async function ask(e, h, update) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: LANE_SYSTEM, messages: [{ role: "user", content: lanePrompt(e, h, update) }] }),
    });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 15000 * (attempt + 1)));
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  const text = body.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return finishLaneTags(JSON.parse(extractJson(text)), h);
}

let ok = 0;
const errors = {};
for (const { e, update, hash } of picked) {
  try {
    const h = headlines(e, 7);
    const result = await ask(e, h, update);
    // an empty list is an answer (this event touches no route); kept so it is not re-asked every run
    tags[e.id] = { at: new Date(now).toISOString(), by: "pipeline", hash, ...result };
    ok++;
    console.log(`  ✓ ${e.id}: ${result.tags.length ? result.tags.map((t) => `${t.point} ${Math.round(t.likelihood * 100)}%`).join(", ") : "no route points"}`);
  } catch (err) {
    console.log(`  ✗ ${e.id}: ${err.message}`);
    errors[e.id] = String(err.message).slice(0, 300);
  }
}
await writeFile(path.join(CONTENT, "lane-tags.json"), JSON.stringify(tags, null, 2) + "\n");
await writeFile(path.join(CONTENT, "lane-tags-errors.json"), JSON.stringify({ at: new Date(now).toISOString(), errors }, null, 2) + "\n");
console.log(`${ok}/${picked.length} checked`);
