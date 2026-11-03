"use client";

import { ASPECTS, type Aspect, type Family } from "@/content/fueling";
import { REPORT_SIZES, type ReportSize } from "@/content/reportSizes";
import { useAuth } from "@/components/auth/AuthProvider";
import SignInGate from "@/components/auth/SignInGate";
import FamIcon from "@/components/mapfirst/FamIcon";
import GenerateReport from "@/components/reports/GenerateReport";
import { AI_PAUSED } from "@/content/paused";

/*
  The first thing on an event page: build your report. It says what the report will be built
  around (what is fueling the event), offers the three sizes and builds in place; signed-out
  readers see the same choices and a sign-in. Where a report already exists, a link drops
  down to it. SHARED FILE (npm run sync:shared in apps/atlas).
*/
export default function BuildCard({
  eventId,
  title,
  aspects,
  api = "",
  existing = false,
  hasReport = false,
  bare = false,
}: {
  eventId: string;
  title: string;
  aspects: Aspect[];
  api?: string;
  existing?: boolean;
  hasReport?: boolean;
  bare?: boolean; // inside the report chooser: no box, no heading, just what it is built around and the sizes
}) {
  const a = useAuth();
  const signedIn = !a.enabled || Boolean(a.user && a.profileComplete);
  const uniq = [...new Set(aspects)].slice(0, 5);
  const aspectLine = uniq.length ? (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
      <span>Built around what is fueling it:</span>
      {uniq.map((x) => (
        <span key={x} className="inline-flex items-center gap-1.5 text-ink">
          <FamIcon f={ASPECTS[x].family as Family} size={20} /> {ASPECTS[x].label}
        </span>
      ))}
    </p>
  ) : null;
  const body = signedIn || AI_PAUSED ? (
    <GenerateReport eventId={eventId} existing={existing} api={api} aspects={aspects} compact />
  ) : (
    <>
      <div className="grid gap-2 sm:grid-cols-3" aria-hidden>
        {(Object.keys(REPORT_SIZES) as ReportSize[]).map((k) => (
          <div key={k} className="rounded-md border border-line bg-paper px-3 py-2 opacity-80">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{REPORT_SIZES[k].label}</span>
              <span className="text-xs text-ink-2">about {REPORT_SIZES[k].minutes} min</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <SignInGate what="build a report" />
      </div>
    </>
  );
  if (bare) {
    return (
      <div>
        <p className="text-[15px] text-ink-2">Pick a size and Claude drafts it from today&apos;s news. Yours to read here; it never replaces a bigger shared report.</p>
        {aspectLine}
        <div className="mt-3">{body}</div>
      </div>
    );
  }
  return (
    <section id="build" className="scroll-mt-6 rounded-2xl border border-gold/70 bg-paper-2 p-4 sm:p-5" aria-label="Build a report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">Your report</p>
          <h2 className="mt-0.5 text-2xl leading-tight">Build a report on {title}</h2>
        </div>
        {hasReport ? (
          <a href="#report" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm no-underline hover:border-ink">
            A full report is ready · read it ↓
          </a>
        ) : null}
      </div>
      {uniq.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
          <span>Built around what is fueling it:</span>
          {uniq.map((x) => (
            <span key={x} className="inline-flex items-center gap-1.5 text-ink">
              <FamIcon f={ASPECTS[x].family as Family} size={20} /> {ASPECTS[x].label}
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-3">
        {signedIn || AI_PAUSED ? (
          <GenerateReport eventId={eventId} existing={existing} api={api} aspects={aspects} compact />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3" aria-hidden>
              {(Object.keys(REPORT_SIZES) as ReportSize[]).map((k) => (
                <div key={k} className="rounded-md border border-line bg-paper px-3 py-2 opacity-80">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{REPORT_SIZES[k].label}</span>
                    <span className="text-xs text-ink-2">about {REPORT_SIZES[k].minutes} min</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <SignInGate what="build a report" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
