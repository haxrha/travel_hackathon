import { tavilySearch } from "../tools/search/tavily";

export interface DestinationProfile {
  destination: string;
  neighborhoods: { name: string; vibe: string; walkability: number }[];
  safety: { score: number; notes: string };
  transport: { modes: string[]; complexity: number };
  seasonality: { bestMonths: string[]; avoidMonths: string[] };
  costs: { foodIndex: number; hotelIndex: number; activityIndex: number };
  accessibility: { notes: string; stepFree: boolean };
  authenticityIndex: number; // 0-100 locality index
}

export async function getDestinationProfile(destination: string): Promise<DestinationProfile> {
  const results = await tavilySearch(`neighborhoods safety walkability food cost ${destination}`);
  const base: DestinationProfile = {
    destination,
    neighborhoods: [
      { name: "Downtown", vibe: "commercial", walkability: 92 },
      { name: "Old Town", vibe: "historic", walkability: 78 },
      { name: "Waterfront", vibe: "scenic", walkability: 85 },
    ],
    safety: { score: 84, notes: "Generally safe; exercise standard urban precautions at night." },
    transport: { modes: ["subway", "bus", "rideshare", "walking"], complexity: 3 },
    seasonality: { bestMonths: ["Apr", "May", "Sep", "Oct"], avoidMonths: ["Jul", "Aug"] },
    costs: { foodIndex: 72, hotelIndex: 88, activityIndex: 65 },
    accessibility: { notes: "Subway step-free stations limited; verify before arrival.", stepFree: false },
    authenticityIndex: 68,
  };
  return base;
}
