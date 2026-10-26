"use client";

import { useMemo } from "react";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { POINT_BY_ID, type Place } from "@/content/lanes";
import type { RiskLevel, RouteAssessment } from "@/content/laneRisk";

const W = 960;
const H = 500;
export const LEVEL_COLOR: Record<RiskLevel, string> = { low: "var(--green)", medium: "var(--amber)", high: "var(--red)" };

const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land);

/* How many route segments a map centred on `lon` would cut at its edge. */
function cuts(routes: RouteAssessment[], lon: number): number {
  const seam = ((lon + 360) % 360) - 180; // the meridian opposite the centre
  let n = 0;
  for (const a of routes) {
    const p = a.route.path;
    for (let i = 1; i < p.length; i++) {
      const x0 = ((p[i - 1][0] - seam + 540) % 360) - 180;
      const x1 = ((p[i][0] - seam + 540) % 360) - 180;
      if (Math.abs(x1 - x0) > 180) n++;
    }
  }
  return n;
}

function projectionFor(routes: RouteAssessment[], origin: Place, destination: Place): GeoProjection {
  // centre where the fewest routes are cut, preferring the middle of the lane
  const mid = (() => {
    const a = (origin.lon * Math.PI) / 180, b = (destination.lon * Math.PI) / 180;
    return (Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) * 180) / Math.PI;
  })();
  let best = mid;
  let bestScore = Infinity;
  for (let lon = -180; lon < 180; lon += 10) {
    const score = cuts(routes, lon) * 1000 + Math.abs((((lon - mid) % 360) + 540) % 360 - 180);
    if (score < bestScore) { bestScore = score; best = lon; }
  }
  const proj = geoNaturalEarth1().rotate([-best, 0]);
  const pts = routes.flatMap((a) => a.route.path);
  if (!pts.length) return proj.fitExtent([[8, 8], [W - 8, H - 8]], { type: "Sphere" });
  proj.fitExtent([[40, 40], [W - 40, H - 40]], { type: "MultiPoint", coordinates: pts });
  // never zoom in past a regional view, so a short lane still shows where it is
  if (proj.scale() > 900) proj.scale(900);
  return proj;
}

export default function LaneMap({
  routes,
  origin,
  destination,
  selected,
  onSelect,
}: {
  routes: RouteAssessment[];
  origin: Place;
  destination: Place;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const g = useMemo(() => {
    const proj = projectionFor(routes, origin, destination);
    const path = geoPath(proj);
    const at = (lon: number, lat: number) => proj([lon, lat]) ?? [0, 0];
    const lines = routes.map((a, i) => {
      const d = path({ type: "LineString", coordinates: a.route.path }) ?? "";
      // badges sit at different points along each line so overlapping routes keep both numbers readable
      const at0 = [0.5, 0.38, 0.62, 0.28][i] ?? 0.5;
      const m = a.route.path[Math.floor((a.route.path.length - 1) * at0)];
      return { a, i, d, badge: at(m[0], m[1]) };
    });
    const hit = new Map<string, RiskLevel>();
    for (const a of routes) for (const h of a.hits) {
      const lvl: RiskLevel = h.likelihood >= 0.4 ? "high" : h.likelihood >= 0.15 ? "medium" : "low";
      if (!hit.has(h.point) || lvl === "high") hit.set(h.point, lvl);
    }
    const marks = [...hit.entries()].map(([id, lvl]) => {
      const p = POINT_BY_ID[id];
      const [x, y] = at(p.lon, p.lat);
      return { id, name: p.name, lvl, x, y };
    });
    return {
      land: path(LAND) ?? "",
      sphere: path({ type: "Sphere" }) ?? "",
      lines,
      marks,
      o: at(origin.lon, origin.lat),
      d: at(destination.lon, destination.lat),
    };
  }, [routes, origin, destination]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-lg border border-line" style={{ background: "var(--sea)" }} role="img" aria-label={`Routes from ${origin.name} to ${destination.name}`}>
      <defs>
        <clipPath id="lane-sphere"><path d={g.sphere} /></clipPath>
      </defs>
      <g clipPath="url(#lane-sphere)">
        <path d={g.land} fill="var(--land)" stroke="var(--land-line)" strokeWidth={0.6} />
        {g.lines.map(({ a, d }) => {
          const on = selected === a.route.id;
          return (
            <path
              key={a.route.id}
              d={d}
              fill="none"
              stroke={LEVEL_COLOR[a.level]}
              strokeWidth={on ? 4 : 2}
              strokeOpacity={selected && !on ? 0.35 : 0.95}
              strokeDasharray={a.level === "low" ? undefined : a.level === "medium" ? "8 5" : "3 4"}
              strokeLinecap="round"
              className="cursor-pointer"
              onClick={() => onSelect(a.route.id)}
            >
              <title>{`${a.route.label}: ${Math.round(a.chance * 100)}% chance of disruption`}</title>
            </path>
          );
        })}
      </g>
      {g.marks.map((m) => (
        <g key={m.id}>
          <circle cx={m.x} cy={m.y} r={8} fill={LEVEL_COLOR[m.lvl]} fillOpacity={0.25} stroke={LEVEL_COLOR[m.lvl]} strokeWidth={2} />
          <circle cx={m.x} cy={m.y} r={3} fill={LEVEL_COLOR[m.lvl]} />
          <title>{`${m.name}: events on the map affect it`}</title>
        </g>
      ))}
      {g.lines.map(({ a, i, badge }) => (
        <g key={`b-${a.route.id}`} className="cursor-pointer" onClick={() => onSelect(a.route.id)}>
          <circle cx={badge[0]} cy={badge[1]} r={11} fill="var(--paper)" stroke={LEVEL_COLOR[a.level]} strokeWidth={2} />
          <text x={badge[0]} y={badge[1] + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ink)">{i + 1}</text>
        </g>
      ))}
      {[{ p: g.o, label: origin.name }, { p: g.d, label: destination.name }].map(({ p, label }, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={6} fill="var(--gold)" stroke="var(--paper)" strokeWidth={2} />
          <text x={p[0] + (p[0] > W - 160 ? -10 : 10)} y={p[1] - 9} textAnchor={p[0] > W - 160 ? "end" : "start"} fontSize={13} fontWeight={600} fill="var(--ink)" stroke="var(--paper)" strokeWidth={3} paintOrder="stroke">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
