import { NextRequest } from "next/server";
import { AI_PAUSED, PAUSED_NOTE } from "@/content/paused";
import { getEvent } from "@/content/events";
import { NEWS, newsUrl, parseNews } from "@/content/news";
import { FUEL_SYSTEM, finishFuel, fuelPrompt, type FuelHeadline, type FuelSet } from "@/content/fueling";
import { DEFAULT_MODEL, extractJson } from "@/content/drafting";
import { perDay, remaining, spend, verifyReader } from "@/lib/readerAuth";

/*
  What's fueling it, on demand.
    POST /api/fuel { eventId, headlines? }  a signed-in reader (or the owner's passcode) asks
      Claude to map the small events feeding this event from its latest local news, searched
      here and then; READER_FUEL_RUNS_PER_DAY each (default 5). Returns a FuelSet.
    GET /api/fuel?id=<eventId>  the latest on-demand result for that event, for every reader
      (kept in memory until the server restarts); 404 when there is none.
  The pipeline does the same for active events every run; the Atlas shows whichever is newer.
*/

const CORS_ORIGIN = process.env.REPORT_CORS_ORIGIN ?? "https://neel8636.github.io";
function cors(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allow = origin && (origin === CORS_ORIGIN || origin.startsWith("http://localhost")) ? origin : CORS_ORIGIN;
  return { "access-control-allow-origin": allow, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-passcode, authorization", vary: "origin" };
}

const latest = new Map<string, FuelSet>();

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const set = latest.get(id);
  return set ? Response.json(set, { headers: { ...cors(req), "cache-control": "no-store" } }) : Response.json({ items: [] }, { status: 404, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const h = cors(req);
  const key = process.env.ANTHROPIC_API_KEY;
  if (AI_PAUSED) return Response.json({ ok: false, paused: true, error: PAUSED_NOTE }, { status: 503, headers: h });
  if (!key) return Response.json({ ok: false, error: "Not switched on for this server." }, { status: 503, headers: h });
  const owner = Boolean(process.env.REPORT_PASSCODE) && req.headers.get("x-passcode") === process.env.REPORT_PASSCODE;
  const reader = owner ? null : await verifyReader(req.headers.get("authorization"));
  if (!owner && !reader) return Response.json({ ok: false, error: "Sign in to run this." }, { status: 401, headers: h });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {}
  const event = getEvent(String(body.eventId ?? ""));
  if (!event) return Response.json({ ok: false, error: "Unknown event." }, { status: 404, headers: h });
  const prev = latest.get(event.id);
  if (prev && Date.now() - Date.parse(prev.at) < 20 * 60_000) return Response.json({ ok: true, ...prev, cached: true }, { headers: h }); // someone just ran it
  if (reader) {
    if (remaining(reader.uid, "fuel") <= 0) return Response.json({ ok: false, error: `You've used today's ${perDay("fuel")} runs. More tomorrow.` }, { status: 429, headers: h });
    spend(reader.uid, "fuel");
  }

  // fresh local news for this event, plus whatever the reader's page already had
  const heads: FuelHeadline[] = [];
  const s = NEWS[event.id];
  if (s) {
    try {
      const r = await fetch(newsUrl(s, 2), { headers: { "user-agent": "Mozilla/5.0 (geopolitica)" }, signal: AbortSignal.timeout(12_000) });
      if (r.ok) heads.push(...parseNews(await r.text()).slice(0, 25));
    } catch {}
  }
  for (const x of (Array.isArray(body.headlines) ? body.headlines : []).slice(0, 12) as Record<string, unknown>[]) {
    const t = String(x.title ?? "").slice(0, 200);
    if (t && !heads.some((y) => y.title === t)) heads.push({ title: t, url: String(x.url ?? ""), publisher: String(x.publisher ?? "").slice(0, 60), published: String(x.published ?? "") });
  }
  if (heads.length < 3) return Response.json({ ok: false, error: "Not enough recent news on this event to map yet." }, { status: 422, headers: h });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
      body: JSON.stringify({ model: process.env.FUEL_MODEL ?? DEFAULT_MODEL, max_tokens: 1500, system: FUEL_SYSTEM, messages: [{ role: "user", content: fuelPrompt(event, heads.slice(0, 30)) }] }),
    });
    if (!res.ok) throw new Error(`the model service answered ${res.status}`);
    const out = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = out.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const items = finishFuel(JSON.parse(extractJson(text)), event, heads.slice(0, 30));
    if (!items.length) throw new Error("no small events in the latest news are clear enough to map");
    const set: FuelSet = { at: new Date().toISOString(), by: "reader", items };
    latest.set(event.id, set);
    return Response.json({ ok: true, ...set }, { headers: h });
  } catch (err) {
    return Response.json({ ok: false, error: `Couldn't map it: ${(err as Error).message}.` }, { status: 502, headers: h });
  }
}
