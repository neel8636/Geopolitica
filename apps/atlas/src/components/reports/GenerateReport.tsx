"use client";

import { useEffect, useState } from "react";
import type { Dossier } from "@/content/types";
import { DossierBody } from "@/components/dossier/DossierBody";
import { useAuth } from "@/components/auth/AuthProvider";
import { REPORT_SIZES, type ReportSize } from "@/content/reportSizes";
import { ASPECTS, type Aspect, type Family } from "@/content/fueling";
import FamIcon from "@/components/mapfirst/FamIcon";
import { AI_PAUSED, PAUSED_NOTE } from "@/content/paused";

/*
  Generate (or regenerate) the layered report for an event from the page itself.
  Talks to the enterprise server's /api/reports/generate. Signed-in readers send their
  Firebase ID token, which the server verifies and allows a few reports a day; the owner's
  passcode still works for the owner. Pages wrap it in <MembersOnly>, so readers sign in first.
  SHARED FILE: the enterprise edition runs a copy (npm run sync:shared in apps/atlas). The reader picks how big a report they want
  (snapshot, standard, deep dive: the same layers at three depths), and every report is built
  around what is fueling the event. The result renders in place; whether it also becomes the
  event's shared report depends on the server (shown in the status line).
*/
type Phase = "idle" | "checking" | "unavailable" | "working" | "done" | "error";

export default function GenerateReport({
  eventId,
  existing = false,
  api = "",
  aspects = [],
  compact = false,
}: {
  eventId: string;
  existing?: boolean; // a report already shows on this page; offer a refresh instead
  api?: string; // base URL of the enterprise server; empty = same origin
  aspects?: Aspect[]; // what is fueling the event, so the reader sees what the report is built around
  compact?: boolean; // inside the event page's build card, which already says what the report is built around
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const { user } = useAuth();
  const [serverNeedsPasscode, setNeedsPasscode] = useState(false);
  const [readersAllowed, setReadersAllowed] = useState(false);
  const [perDay, setPerDay] = useState(0);
  const [persists, setPersists] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [size, setSize] = useState<ReportSize>("brief");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ dossier: Dossier; saved: { local: boolean; repo: boolean; shared?: boolean }; unknownSources: string[] } | null>(null);

  const endpoint = `${api}/api/reports/generate`;

  // the map's "Build report" arrives here with the size already picked: ?size=snapshot#report
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get("size");
    if (z === "snapshot" || z === "brief" || z === "deep") queueMicrotask(() => setSize(z));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(endpoint)
      .then((r) => r.json())
      .then((j: { available: boolean; passcode: boolean; persists: boolean; readers?: boolean; perDay?: number }) => {
        if (!alive) return;
        setNeedsPasscode(j.passcode);
        setReadersAllowed(Boolean(j.readers));
        setPerDay(j.perDay ?? 0);
        setPersists(j.persists);
        setPhase(j.available ? "idle" : "unavailable");
      })
      .catch(() => alive && setPhase("unavailable"));
    return () => {
      alive = false;
    };
  }, [endpoint]);

  const uniq = [...new Set(aspects)].slice(0, 6);

  // a signed-in reader is let through by their sign-in; the passcode is for everyone else
  const useToken = Boolean(user && readersAllowed);
  const needsPasscode = serverNeedsPasscode && !useToken;

  async function run() {
    setPhase("working");
    setLog([]);
    setError("");
    try {
      const token = useToken && user ? await user.getIdToken() : "";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(passcode && !token ? { "x-passcode": passcode } : {}),
        },
        body: JSON.stringify({ eventId, size }),
      });
      if (!res.ok || !res.body) {
        let msg = `${res.status}`;
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let last = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line || line === "…") continue;
          if (line.startsWith("{")) last = line;
          else setLog((l) => [...l, line]);
        }
      }
      if (buffer.startsWith("{")) last = buffer;
      if (!last) throw new Error("the server closed the connection before finishing");
      const parsed = JSON.parse(last) as { ok: boolean; error?: string; dossier?: Dossier; saved?: { local: boolean; repo: boolean; shared?: boolean }; unknownSources?: string[] };
      if (!parsed.ok || !parsed.dossier) throw new Error(parsed.error ?? "generation failed");
      setResult({ dossier: parsed.dossier, saved: parsed.saved ?? { local: false, repo: false }, unknownSources: parsed.unknownSources ?? [] });
      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  }

  if (AI_PAUSED)
    return (
      <p className="rounded-lg border border-line bg-paper-2 px-4 py-3 text-[15px] text-ink-2">
        <b className="font-semibold text-ink">Paused for now.</b> {PAUSED_NOTE}
      </p>
    );
  if (phase === "checking") return null;

  if (phase === "unavailable") {
    return (
      <p className="text-sm text-ink-3">
        Report generation is not switched on for this server. The hourly pipeline still drafts reports for new events.
      </p>
    );
  }

  return (
    <div>
      {phase !== "done" ? (
        <div className={compact ? "text-[15px]" : "rounded-lg border border-line bg-paper-2 p-4 text-[15px]"}>
          {compact ? null : (<>
          <p className="font-medium">{existing ? "Build a fresh report with today's headlines" : "Build the report for this event"}</p>
          <p className="mt-1 text-ink-2">
            Same layers every time (a 30-second card, the brief, the deep dive and the evidence); you choose how deep it goes.
            {persists ? "" : " The result shows here and stays on this server until its next deploy."}
            {useToken && perDay ? ` Each reader can build ${perDay} reports a day.` : ""}
          </p>
          {uniq.length ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-ink-2">Built around what is fueling it</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {uniq.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5 text-sm">
                    <FamIcon f={ASPECTS[a].family as Family} size={20} /> {ASPECTS[a].label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          </>)}
          <div className={`${compact ? "" : "mt-3 "}grid gap-2 sm:grid-cols-3`} role="radiogroup" aria-label="Report size">
            {(Object.keys(REPORT_SIZES) as ReportSize[]).map((k) => {
              const z = REPORT_SIZES[k];
              const on = size === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSize(k)}
                  disabled={phase === "working"}
                  className={`rounded-md border text-left ${compact ? "px-3 py-2" : "p-3"} ${on ? "border-teal bg-paper ring-1 ring-teal" : "border-line bg-paper hover:border-ink-3"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{z.label}</span>
                    <span className="text-xs text-ink-2">about {z.minutes} min read</span>
                  </span>
                  <span className={`mt-1 text-[13px] leading-snug text-ink-2 ${compact ? "hidden sm:block" : "block"}`}>{z.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {needsPasscode ? (
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                className="rounded-sm border border-line bg-paper px-2 py-1.5 text-sm"
                aria-label="Passcode"
              />
            ) : null}
            <button
              type="button"
              onClick={run}
              disabled={phase === "working" || (needsPasscode && !passcode)}
              className="rounded-sm bg-teal px-4 py-2 text-paper hover:opacity-90 disabled:opacity-60"
            >
              {phase === "working" ? "Drafting…" : `Build ${REPORT_SIZES[size].label.toLowerCase()} report`}
            </button>
            {phase === "working" ? <span className="text-sm text-ink-2">{log[log.length - 1] ?? "Starting"}</span> : null}
            {phase === "error" ? <span className="text-sm text-red">{error}</span> : null}
          </div>
        </div>
      ) : null}

      {phase === "done" && result ? (
        <div className="mt-6">
          <div className="rounded-lg border border-green bg-green-2 p-4 text-[15px]">
            <p className="font-medium">Report generated.</p>
            <p className="mt-1 text-ink-2">
              {result.saved.shared === false
                ? "This one is yours: it shows here and does not replace the event's shared report."
                : result.saved.repo
                ? "Saved to the atlas; it is live in both editions after the next deploy (a few minutes)."
                : result.saved.local
                  ? "Saved on this server until its next deploy. Set a GitHub token on the server to keep reports for good."
                  : "Shown here only."}
              {result.unknownSources.length ? ` Check these sources, which were not in the material: ${result.unknownSources.join(", ")}.` : ""}
            </p>
          </div>
          <div className="mt-6 border-t-2 border-teal pt-6">
            <DossierBody d={result.dossier} backHref="#" backLabel="Top" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
