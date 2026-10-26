import { EVENTS } from "@/content/events";
import { buildLaneFeed, type LaneTagFile } from "@/content/laneTags";
import tags from "@/content/lane-tags.json";

// Which route points each event disrupts (scripts/lanetags.mjs), for the enterprise edition's
// Lanes page. Rebuilt with the site every hour.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildLaneFeed(tags as unknown as LaneTagFile, EVENTS));
}
