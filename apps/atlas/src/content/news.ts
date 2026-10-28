// Local news per event: a Google News search for each event, run in the edition closest to
// where it is happening (English editions; Google News has no English edition for every
// country, so European events use the UK edition and East African ones Kenya's).
// scripts/wire.mjs runs these on every pipeline pass, alongside the world feeds.

export interface NewsSearch {
  q: string; // Google News query syntax
  edition: "US" | "GB" | "CA" | "IN" | "PH" | "KE" | "IL" | "AU";
}

import discovered from "./events/discovered.json" with { type: "json" };

// events added from the news carry their own search (scripts/discover.mjs)
const DISCOVERED_NEWS: Record<string, NewsSearch> = Object.fromEntries(
  (discovered as unknown as { events: { id: string; news?: NewsSearch }[] }).events.filter((e) => e.news?.q).map((e) => [e.id, e.news as NewsSearch]),
);

export const NEWS: Record<string, NewsSearch> = {
  ...DISCOVERED_NEWS,
  "france-unrest-2026": { q: '(France OR Paris) (protest OR protests OR riots OR "general strike" OR blockade)', edition: "GB" },
  "gulf-war-energy-shock": { q: 'Iran (war OR strikes) (oil OR Hormuz OR "Red Sea" OR Houthi OR Brent)', edition: "US" },
  "france-debt-stress": { q: 'France (bonds OR OAT OR "bond spread" OR "Moody\'s" OR "budget deficit")', edition: "GB" },
  "france-election-2027": { q: 'France 2027 presidential (Le Pen OR Bardella OR poll OR candidate)', edition: "GB" },
  "italy-cost-of-living-riots": { q: '(Milan OR Turin OR Bologna) (protest OR riots OR clashes OR "cost of living")', edition: "GB" },
  "italy-election-2027": { q: 'Italy (election OR poll) (Meloni OR "Brothers of Italy" OR coalition)', edition: "GB" },
  "belgium-cost-of-living-clashes": { q: '(Brussels OR Liege OR Belgium) (protest OR clashes OR strike OR students)', edition: "GB" },
  "portugal-housing-protests": { q: 'Portugal (housing OR rents OR wages) (march OR protest OR demonstration)', edition: "GB" },
  "spain-strike-and-snap-election": { q: 'Spain ("general strike" OR "snap election" OR Sánchez OR unions)', edition: "GB" },
  "ukraine-summit-diplomacy": { q: 'Ukraine (summit OR "peace talks" OR ceasefire) (Putin OR Trump OR Xi OR Zelensky)', edition: "US" },
  "eu-budget-2028-2034": { q: '"EU budget" (2028 OR MFF OR "long-term budget" OR "multiannual")', edition: "GB" },
  "ecb-inflation-and-rates": { q: 'ECB (Lagarde OR "interest rates" OR "rate hike" OR inflation)', edition: "GB" },
  "eu-supply-chain-rules-2027": { q: '(EUDR OR CBAM OR "deforestation regulation" OR "carbon border adjustment")', edition: "GB" },
  "alberta-independence-vote": { q: 'Alberta (referendum OR separatism OR independence OR separatist)', edition: "CA" },
  "china-q3-growth": { q: 'China (economy OR GDP OR exports OR "economic growth")', edition: "US" },
  "istanbul-floods": { q: 'Istanbul (flood OR floods OR flooding OR storm)', edition: "GB" },
  "us-midterms-2026": { q: 'midterms (House OR Senate OR polls OR "generic ballot")', edition: "US" },
  "brazil-runoff-2026": { q: 'Brazil (runoff OR "run-off" OR election) (Lula OR Bolsonaro)', edition: "US" },
  "us-canada-trade-war": { q: 'Canada (tariffs OR "trade war") (Trump OR Carney OR dairy OR "Section 338")', edition: "CA" },
  "usmca-annual-review-2027": { q: '(USMCA OR CUSMA OR "T-MEC") (review OR talks OR deadline)', edition: "CA" },
  "venezuela-oil-reopening": { q: 'Venezuela oil (investment OR PDVSA OR Chevron OR license OR output)', edition: "US" },
  "apec-shenzhen-2026": { q: 'APEC (Shenzhen OR summit) (Trump OR Xi OR trade)', edition: "AU" },
  "boj-october-decision-2026": { q: '("Bank of Japan" OR BOJ) (rates OR "rate hike" OR yen OR Ueda)', edition: "US" },
  "india-us-trade-deal-2026": { q: 'India US "trade deal" (Rubio OR Jaishankar OR tariffs OR "Russian oil")', edition: "IN" },
  "north-korea-missile-tests-2026": { q: '"North Korea" (missile OR missiles OR "Kim Jong Un" OR launch)', edition: "US" },
  "south-china-sea-incidents-2026": { q: '"South China Sea" (Philippines OR "coast guard" OR shoal OR Spratly)', edition: "PH" },
  "sudan-darfur-kordofan-famine-alert": { q: 'Sudan (famine OR Darfur OR Kordofan OR RSF OR "El Fasher")', edition: "KE" },
  "ethiopia-eritrea-war-fears": { q: '(Ethiopia OR Eritrea) (Tigray OR Assab OR war OR troops OR border)', edition: "KE" },
  "israel-election-2026": { q: 'Israel election (Netanyahu OR Knesset OR poll OR coalition)', edition: "IL" },
  "opec-plus-november-output-hold": { q: '(OPEC OR "OPEC+") (output OR quotas OR production OR Brent)', edition: "US" },
  "black-october-ai-cyber-wave-2026": { q: '("Black October" OR PHP2Shell OR "CVE-2026-109618" OR "CVE-2026-109619" OR (LiteLLM malicious) OR eMudhra)', edition: "US" },
  "russia-record-budget-deficit-2026": { q: 'Russia (budget OR deficit OR "oil revenue" OR ruble OR "oil and gas revenues")', edition: "GB" },
};

export function newsUrl(s: NewsSearch, days = 3): string {
  const hl = ["US", "GB", "CA", "IN", "AU"].includes(s.edition) ? `en-${s.edition}` : "en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${s.q} when:${days}d`)}&hl=${hl}&gl=${s.edition}&ceid=${s.edition}:en`;
}

// A small RSS reader for the Google News results (used where the wire script's parser is not
// available, such as the enterprise server's on-demand fueling search).
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNews(xml: string): { title: string; url: string; publisher: string; published: string }[] {
  const out: { title: string; url: string; publisher: string; published: string }[] = [];
  for (const b of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []) {
    const get = (name: string) => decode(b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
    const source = get("source");
    let title = get("title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(` - ${source}`).length);
    const when = Date.parse(get("pubDate"));
    const url = get("link");
    if (!title || !url || !Number.isFinite(when)) continue;
    out.push({ title, url, publisher: source || "Google News", published: new Date(when).toISOString() });
  }
  return out.sort((a, b) => (a.published < b.published ? 1 : -1));
}
