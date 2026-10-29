#!/usr/bin/env node
// Files both editions run byte for byte. Edit them here, in the Atlas, then run
//   npm run sync:shared            copy them into apps/web
//   npm run sync:shared -- --check list any that differ (exit 1), copy nothing
// Each file uses only "@/..." paths that exist in both apps, and packages both install.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const atlas = path.join(here, "..", "src");
const web = path.join(here, "..", "..", "web", "src");
export const SHARED = [
  "components/mapfirst/MapFirst.tsx",
  "components/reports/GenerateReport.tsx",
  "components/intro/Welcome.tsx",
  "components/intro/IntroGate.tsx",
  "components/guide/MapGuide.tsx",
  "components/dossier/HowItConnects.tsx",
  "components/dossier/RippleStrip.tsx",
  "components/dossier/DossierBody.tsx",
  "components/dossier/ReportParts.tsx",
  "components/dossier/ChapterBar.tsx",
  "components/reports/BuildCard.tsx",
  "components/reports/ReportChooser.tsx",
  "components/reports/PlainBox.tsx",
  "components/reports/AutoNote.tsx",
  "components/RippleMap.tsx",
  "components/mapfirst/FamIcon.tsx",
  "components/auth/AuthProvider.tsx",
  "components/auth/AccountForms.tsx",
  "components/auth/AccountMenu.tsx",
  "components/auth/MembersOnly.tsx",
  "components/auth/JoinView.tsx",
  "components/auth/ConsentBanner.tsx",
  "components/auth/SignInGate.tsx",
  "components/ThemeToggle.tsx",
  "components/MobileNav.tsx",
  "lib/firebase.ts",
  "app/join/page.tsx",
];

const check = process.argv.includes("--check");
let differ = 0;
for (const f of SHARED) {
  const a = path.join(atlas, f), b = path.join(web, f);
  const [x, y] = await Promise.all([readFile(a, "utf8"), readFile(b, "utf8").catch(() => null)]);
  if (x === y) continue;
  differ++;
  if (check) console.log(`differs: ${f}`);
  else {
    await mkdir(path.dirname(b), { recursive: true });
    await copyFile(a, b);
    console.log(`copied: ${f}`);
  }
}
if (check && differ) process.exit(1);
if (!differ) console.log("shared files are in step");
