"use client";

import { useEffect, useId, useState } from "react";
import type { RippleRing } from "@/content/types";

interface Props {
  centre: string; // the event, short
  rings: RippleRing[]; // inner to outer
  compact?: boolean;
}

/*
  The ripple map: the event sits at the centre and its effects spread out in rings, like a
  stone dropped in water. The closer a ring is to the event, the harder and sooner it is hit,
  so the colour is strongest at the centre and fades ring by ring; dots and labels shrink and
  soften the same way. Hover, tap or tab to a dot to read the full effect.
  Drawn from report or connection data, so it is never decorative.
  SHARED FILE (npm run sync:shared in apps/atlas).
*/
const STRENGTH = ["Hit first and hardest", "Hit next", "Felt later, and weaker", "Felt least"];

export default function RippleMap({ centre, rings: given, compact = false }: Props) {
  // a drafted report can carry a malformed ring; draw only the well-formed ones
  const rings = given.filter((g) => Array.isArray(g.effects) && g.effects.length);
  const id = useId().replace(/:/g, "");
  const size = 600;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 74;
  const outerPad = 66;
  const n = rings.length;
  const step = (size / 2 - innerR - outerPad) / Math.max(1, n);
  const radius = (ri: number) => innerR + step * (ri + 1);
  const strength = (ri: number) => (n <= 1 ? 1 : 1 - ri / n); // 1 at the inner ring, fading outward
  const label = (ri: number) => (ri === 0 ? STRENGTH[0] : ri === n - 1 ? (n > 2 ? STRENGTH[2] : STRENGTH[1]) : STRENGTH[1]);
  const [active, setActive] = useState<{ ring: number; i: number }>({ ring: 0, i: 0 });
  // on a phone the drawing is ~330px wide: bigger type and dots, and only the inner ring is
  // labelled on the drawing (the list underneath names every ring's effects)
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const big = narrow ? 1.75 : 1;

  const dots = rings.flatMap((ring, ri) => {
    const r = radius(ri);
    const count = ring.effects.length;
    // spread dots around the ring; offset each ring so dots do not line up radially, and turn
    // the ring a little if a dot would sit on its number at the top
    const base = -54 + ri * 27;
    const nearTop = (b: number) => Array.from({ length: count }, (_, i) => b + (360 / count) * i).some((d) => Math.abs(((((d + 90) % 360) + 540) % 360) - 180) < 20);
    const start = nearTop(base) ? base + Math.min(24, 180 / count) : base;
    return ring.effects.map((e, i) => {
      const deg = start + (360 / count) * i;
      const angle = deg * (Math.PI / 180);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const cos = Math.cos(angle);
      const anchor: "start" | "end" | "middle" = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      const gap = 13 - ri * 1.5;
      const lx = x + (anchor === "start" ? gap : anchor === "end" ? -gap : 0);
      const ly = y + (anchor === "middle" ? (Math.sin(angle) < 0 ? -gap : gap + 8) : 4);
      return { ring: ri, i, x, y, lx, ly, anchor, text: e.text, sector: e.sector ?? "" };
    });
  });

  const current = dots.find((d) => d.ring === active.ring && d.i === active.i);
  const outer = radius(n - 1);

  return (
    <figure className="w-full">
      <svg
        viewBox={narrow ? `-40 30 ${size + 80} ${size - 60}` : `-80 0 ${size + 160} ${size}`} // side margin so long labels on the outer ring are not clipped; none needed on a phone
        role="img"
        aria-labelledby={`${id}-title`}
        className="mx-auto block w-full max-w-[680px]"
        fontFamily="var(--font-sans)"
      >
        {/* one string: React renders a <title> with several children as empty on the server */}
        <title id={`${id}-title`}>{`Ripple map: ${centre}, with ${n} rings of effects, strongest at the centre`}</title>
        <defs>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset={`${Math.round((innerR / outer) * 100)}%`} stopColor="var(--gold)" stopOpacity={0.42} />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.03} />
          </radialGradient>
          <style>{`
            @keyframes ${id}-wave { from { transform: scale(${(innerR / outer).toFixed(3)}); opacity: .55 } to { transform: scale(1); opacity: 0 } }
            .${id}-wave { transform-origin: ${cx}px ${cy}px; transform-box: view-box; animation: ${id}-wave 3.6s ease-out infinite; }
            @media (prefers-reduced-motion: reduce) { .${id}-wave { display: none } }
          `}</style>
        </defs>

        {/* the colour field: strongest next to the event, fading to almost nothing at the edge */}
        <circle cx={cx} cy={cy} r={outer} fill={`url(#${id}-glow)`} />
        {/* each ring a band, drawn outer to inner so the inner ones stack up darker */}
        {[...rings].map((_, k) => n - 1 - k).map((ri) => (
          <circle key={`band-${ri}`} cx={cx} cy={cy} r={radius(ri)} fill="var(--gold)" fillOpacity={0.05 + strength(ri) * 0.06} />
        ))}
        {/* a wave travelling outward, so the eye reads the direction of the ripple */}
        <circle className={`${id}-wave`} cx={cx} cy={cy} r={outer} fill="none" stroke="var(--gold)" strokeWidth={2} />

        {rings.map((ring, ri) => {
          const r = radius(ri);
          const s = strength(ri);
          return (
            <g key={ring.label + ri}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--gold)"
                strokeOpacity={0.35 + s * 0.6}
                strokeWidth={1 + s * 2}
                strokeDasharray={ri === 0 ? undefined : ri === n - 1 && n > 2 ? "2 6" : "6 5"}
              />
              {/* the ring's number at its top (dots start at -54 degrees, so none lands there); the list below says what each ring means */}
              <circle cx={cx} cy={cy - r} r={11 * big} fill="var(--paper)" stroke="var(--gold)" strokeOpacity={0.35 + s * 0.6} strokeWidth={1.5 + s} />
              <text x={cx} y={cy - r + 4 * big} fontSize={11.5 * big} fontWeight={700} fill={ri === 0 ? "var(--gold)" : "var(--ink-2)"} textAnchor="middle">
                {ri + 1}
              </text>
            </g>
          );
        })}

        {/* the event itself */}
        <circle cx={cx} cy={cy} r={innerR} fill="var(--gold)" stroke="var(--gold-hi)" strokeWidth={2} />
        <foreignObject x={cx - innerR + 8} y={cy - innerR + 8} width={innerR * 2 - 16} height={innerR * 2 - 16}>
          <div className="flex h-full items-center justify-center text-center font-serif text-[14.5px] font-semibold leading-tight text-paper">
            {centre.length > 70 ? centre.slice(0, 68).replace(/\s+\S*$/, "") + "…" : centre}
          </div>
        </foreignObject>

        {dots.map((d) => {
          const isActive = active.ring === d.ring && active.i === d.i;
          const s = strength(d.ring);
          const r = (5 + s * 4.5) * (narrow ? 1.35 : 1); // inner dots bigger
          const showLabel = !narrow || d.ring === 0;
          return (
            <g key={`${d.ring}-${d.i}`}>
              {showLabel ? <text
                x={narrow ? d.lx + (d.anchor === "start" ? 6 : d.anchor === "end" ? -6 : 0) : d.lx}
                y={narrow ? d.ly + (d.anchor === "middle" ? (d.ly < d.y ? -8 : 10) : 4) : d.ly}
                fontSize={(10.5 + s * 2.5) * big}
                textAnchor={d.anchor}
                fill={isActive || d.ring === 0 ? "var(--ink)" : d.ring === n - 1 && n > 2 ? "var(--ink-3)" : "var(--ink-2)"}
                fontWeight={isActive || d.ring === 0 ? 600 : 400}
                paintOrder="stroke"
                stroke="var(--paper)"
                strokeWidth={3.5}
                strokeLinejoin="round"
                pointerEvents="none"
              >
                {d.sector}
              </text> : null}
              <circle
                cx={d.x}
                cy={d.y}
                r={isActive ? r + 3 : r}
                fill="var(--gold)"
                fillOpacity={isActive ? 1 : 0.35 + s * 0.65}
                stroke={isActive ? "var(--ink)" : "var(--gold)"}
                strokeWidth={isActive ? 2.5 : 1.5}
                tabIndex={0}
                role="button"
                aria-label={`${rings[d.ring].label}: ${d.text}`}
                className="cursor-pointer outline-none focus-visible:stroke-[3]"
                onMouseEnter={() => setActive({ ring: d.ring, i: d.i })}
                onFocus={() => setActive({ ring: d.ring, i: d.i })}
                onClick={() => setActive({ ring: d.ring, i: d.i })}
              />
            </g>
          );
        })}
      </svg>

      {/* the key: one row per ring, its colour fading with distance, and what sits on it */}
      <ol className="mx-auto mt-3 max-w-[600px] space-y-2">
        {rings.map((ring, ri) => (
          <li key={ring.label + ri} className="flex items-start gap-3 text-[14px]">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: `color-mix(in srgb, var(--gold) ${Math.round(15 + strength(ri) * 85)}%, transparent)`, color: ri === 0 ? "var(--paper)" : "var(--ink)" }}
            >
              {ri + 1}
            </span>
            <span className="min-w-0">
              <span className={ri === 0 ? "font-semibold text-ink" : "font-medium text-ink-2"}>{label(ri)}</span>
              <span className="text-ink-3"> · {ring.label}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {ring.effects.map((e, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive({ ring: ri, i })}
                    className={`rounded-full border px-2 py-0.5 text-[12.5px] ${active.ring === ri && active.i === i ? "border-gold bg-gold/15 text-ink" : "border-line text-ink-2 hover:border-ink-3"}`}
                  >
                    {e.sector || e.text.slice(0, 32)}
                  </button>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <figcaption
        className={`mx-auto mt-3 max-w-[600px] border-l-2 border-gold pl-3 text-[15px] ${compact ? "min-h-[3.5rem]" : "min-h-[4.5rem]"}`}
        aria-live="polite"
      >
        {current ? (
          <>
            <span className="text-ink-2">
              Ring {current.ring + 1}, {rings[current.ring].label.toLowerCase()}
              {current.sector ? ` · ${current.sector}` : ""}:{" "}
            </span>
            {current.text}
            <span className="block text-sm text-ink-3">Hover, tap or tab to the other dots.</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
