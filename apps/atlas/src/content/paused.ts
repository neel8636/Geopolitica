// The pause switch (Nov 2026: Claude API credits ran out). While AI_PAUSED is true:
//  - the enterprise server's Claude routes (build a report, Ask, find what's fueling this)
//    answer with PAUSED_NOTE instead of calling the API;
//  - the report builder shows PAUSED_NOTE instead of its form.
// Everything already drafted stays readable. To resume: set AI_PAUSED to false here, then
// put the schedules back in .github/workflows/atlas-pages.yml and heartbeat.yml (see "PAUSED").
export const AI_PAUSED = true;
export const PAUSED_NOTE =
  "Building new reports, Ask and fresh fuel maps are paused for now. Every report and map already here stays open to read.";
