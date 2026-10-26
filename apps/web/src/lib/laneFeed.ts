import { cacheLife } from "next/cache";
import { EVENTS } from "@/content/events";
import { buildLaneFeed, type LaneFeed, type LaneTagFile } from "@/content/laneTags";
import bundled from "../../../atlas/src/content/lane-tags.json";

/*
  Which route points each event disrupts, as the Atlas published it on its last hourly run
  (lanes.json). Read from the published Atlas so the Lanes page stays as fresh as the map
  without a redeploy; if that fails, the copy built into this deploy is used.
*/
const ATLAS = (process.env.ATLAS_URL || "https://neel8636.github.io/Geopolitica").replace(/\/$/, "");

export async function laneFeed(): Promise<LaneFeed> {
  "use cache";
  cacheLife("minutes");
  try {
    const r = await fetch(`${ATLAS}/lanes.json`);
    if (r.ok) {
      const j = (await r.json()) as LaneFeed;
      if (j && Array.isArray(j.events)) return j;
    }
  } catch {}
  return buildLaneFeed(bundled as unknown as LaneTagFile, EVENTS);
}
