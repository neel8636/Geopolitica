import { NextRequest } from "next/server";
import { AI_PAUSED, PAUSED_NOTE } from "@/content/paused";
import { getEvent, neighbours, LINK_WORDS } from "@/content/events";
import { getDriver } from "@/content/drivers";
import { getDossier } from "@/content/dossiers";
import { DEFAULT_MODEL } from "@/content/drafting";
import { perDay, remaining, spend, verifyReader } from "@/lib/readerAuth";

/*
  Ask a question while reading. POST /api/ask
    { eventId, question, headlines?: [{title, publisher, published}], update?: string,
      history?: [{q, a}] }
  → a plain-text stream of the answer.

  Signed-in Atlas readers only (Firebase ID token as `Authorization: Bearer …`), or the owner
  with the REPORT_PASSCODE; READER_QUESTIONS_PER_DAY each (default 20). The answer is grounded
  in the event, its report, its connections (with direction, channel and driver) and the
  headlines the reader's page is showing; anything beyond that is labelled as background.
    ASK_MODEL   default claude-sonnet-5-5
*/

const CORS_ORIGIN = process.env.REPORT_CORS_ORIGIN ?? "https://neel8636.github.io";
function cors(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allow = origin && (origin === CORS_ORIGIN || origin.startsWith("http://localhost")) ? origin : CORS_ORIGIN;
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-passcode, authorization",
    vary: "origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const SYSTEM = `You are the reading companion on Geopolitica Atlas, a free site that helps anyone understand world events and how they ripple into each other.

Answer the reader's question about the event in the material below.
- Ground every claim in the material: the event, its report, its connections and the headlines. Name where a fact comes from in plain words ("the report says", "a Reuters headline today").
- If the material doesn't cover it, say so in one sentence, then you may add short general background, starting that part with "Background:" so it is clearly not from the sources.
- When asked how one event affects another, follow the connections: say which way the effect travels (one way or both ways), the channel it travels through, and any driver behind it.
- Plain English for a curious 16-year-old. At most 170 words. Short paragraphs or up to four bullets. No em dashes.
- Probabilities and predictions in the report are judgement; say so if you use them. Don't give investment, legal or medical advice; explain the factors instead.
- Stay on world affairs. If the question is unrelated, say briefly what you can help with here.`;

export async function POST(req: NextRequest) {
  const h = cors(req);
  const key = process.env.ANTHROPIC_API_KEY;
  if (AI_PAUSED) return Response.json({ ok: false, paused: true, error: PAUSED_NOTE }, { status: 503, headers: h });
  if (!key) return Response.json({ ok: false, error: "Questions are not switched on for this server." }, { status: 503, headers: h });

  const owner = Boolean(process.env.REPORT_PASSCODE) && req.headers.get("x-passcode") === process.env.REPORT_PASSCODE;
  const reader = owner ? null : await verifyReader(req.headers.get("authorization"));
  if (!owner && !reader) return Response.json({ ok: false, error: "Sign in to ask questions." }, { status: 401, headers: h });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {}
  const event = getEvent(String(body.eventId ?? ""));
  const question = clip(body.question, 500);
  if (!event) return Response.json({ ok: false, error: "Unknown event." }, { status: 404, headers: h });
  if (question.length < 3) return Response.json({ ok: false, error: "Type a question first." }, { status: 400, headers: h });
  if (reader) {
    if (remaining(reader.uid, "ask") <= 0) {
      return Response.json({ ok: false, error: `You've asked today's ${perDay("ask")} questions. More tomorrow.` }, { status: 429, headers: h });
    }
    spend(reader.uid, "ask");
  }

  // the material
  const d = getDossier(event.id);
  const own = d && d.slug === event.id ? d : undefined;
  const lines: string[] = [];
  lines.push(`EVENT: ${event.title} (${event.region}; ${event.status}, latest development ${event.date})`);
  lines.push(`SUMMARY: ${event.summary}`);
  if (own) {
    lines.push(`REPORT (${own.generated && !own.generated.reviewed ? (own.generated.sourceChecked ? "AI-drafted, fact-checked against sources" : "AI-drafted, not yet checked") : "reviewed"}, updated ${own.updated}):`);
    lines.push(`- Headline: ${own.card.headline}. Key number: ${own.card.keyNumber.value} ${own.card.keyNumber.label}`);
    lines.push(`- What happened: ${own.brief.whatHappened.join(" ")}`);
    lines.push(`- Why it matters: ${own.brief.whyItMatters.join(" ")}`);
    lines.push(`- Winners: ${own.brief.winners.map((w) => `${w.who} (${w.why})`).join("; ")}`);
    lines.push(`- Losers: ${own.brief.losers.map((w) => `${w.who} (${w.why})`).join("; ")}`);
    lines.push(`- What's next: ${own.brief.whatsNext.join("; ")}`);
    lines.push(`- Ripple: ${own.card.ripple.map((r) => `${r.label}: ${r.effects.map((e) => e.text).join("; ")}`).join(" | ")}`);
    lines.push(`- Scenarios (judgement): ${own.deep.scenarios.map((s) => `${s.name} ${s.probability}%`).join("; ")}`);
  }
  const links = neighbours(event.id);
  if (links.length) {
    lines.push("CONNECTIONS:");
    for (const n of links) {
      const dir = n.flow === "out" ? "this event drives it" : n.flow === "in" ? "it drives this event" : n.flow === "both" ? "both ways" : "no direction, shared driver";
      const drv = getDriver(n.driver)?.name;
      lines.push(`- ${n.event.title} [${LINK_WORDS[n.kind]}; ${dir}${n.via ? `; via ${n.via}` : ""}${drv ? `; driver: ${drv}` : ""}]: ${n.why}`);
    }
  }
  const update = clip(body.update, 400);
  if (update) lines.push(`LATEST "WHAT CHANGED" LINE (AI summary of headlines): ${update}`);
  const heads = (Array.isArray(body.headlines) ? body.headlines : []).slice(0, 12) as Record<string, unknown>[];
  if (heads.length) {
    lines.push("HEADLINES ON THE READER'S PAGE (newest first):");
    for (const x of heads) lines.push(`- ${clip(x.title, 200)} (${clip(x.publisher, 60)}, ${clip(x.published, 16)})`);
  }
  const history = (Array.isArray(body.history) ? body.history : []).slice(-3) as Record<string, unknown>[];
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of history) {
    messages.push({ role: "user", content: clip(turn.q, 500) });
    messages.push({ role: "assistant", content: clip(turn.a, 1500) });
  }
  messages.push({ role: "user", content: `${lines.join("\n")}\n\nTODAY: ${new Date().toISOString().slice(0, 10)}\n\nQUESTION: ${question}` });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
    body: JSON.stringify({ model: process.env.ASK_MODEL ?? DEFAULT_MODEL, max_tokens: 700, stream: true, system: SYSTEM, messages }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 160);
    return Response.json({ ok: false, error: `The answer service failed (${upstream.status}). ${detail}` }, { status: 502, headers: h });
  }

  // pass the text through as it arrives
  const reader2 = upstream.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        for (;;) {
          const { value, done } = await reader2.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() ?? "";
          for (const line of parts) {
            if (!line.startsWith("data:")) continue;
            try {
              const ev = JSON.parse(line.slice(5)) as { type: string; delta?: { type: string; text?: string } };
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) controller.enqueue(enc.encode(ev.delta.text));
            } catch {}
          }
        }
      } catch {
        controller.enqueue(enc.encode("\n\n(The answer was cut off. Please ask again.)"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...h, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
