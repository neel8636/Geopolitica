import type { Metadata } from "next";
import LanePlanner from "@/components/lanes/LanePlanner";
import MembersOnly from "@/components/auth/MembersOnly";
import { laneFeed } from "@/lib/laneFeed";

export const metadata: Metadata = {
  title: "Lanes",
  description: "Every standard route between two places by sea, road, air or rail, with today's events on it: which route costs more once they are counted, and what to do.",
};

export default async function LanesPage() {
  const feed = await laneFeed();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="signpost">Lanes</p>
      <h1 className="mt-1 text-4xl">Which route costs more today, and what to do about it</h1>
      <p className="prose-dossier mt-3 text-ink-2">
        Pick how your goods move, where from and where to. Every standard route between the two is checked against the
        events on the map: ports, canals, straits, border crossings, airspace and rail corridors. Put in what a shipment
        costs you and see the expected cost of each route once today’s risks are counted.
      </p>
      <div className="mt-8">
        <MembersOnly
          title="Compare your routes with a free account"
          points={[
            "Every standard route between two places, by sea, road, air or rail",
            "Events on the map checked against each port, canal, border and corridor every hour",
            "Expected delay and cost per route with your own freight figures, and what to do",
          ]}
        >
          <LanePlanner feed={feed} />
        </MembersOnly>
      </div>
    </div>
  );
}
