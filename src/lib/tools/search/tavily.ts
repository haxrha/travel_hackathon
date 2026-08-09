/**
 * Tavily — real-time web search for AI agents. Used by Local Agent, Safety Agent,
 * Review Intelligence, and Travel Requirements.
 */

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export async function tavilySearch(query: string, maxResults = 6): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return mockSearch(query);
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: maxResults, include_answer: true }),
  });
  if (!res.ok) return mockSearch(query);
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({ title: r.title, url: r.url, content: r.content, score: r.score }));
}

function mockSearch(q: string): TavilyResult[] {
  return [
    {
      title: `Family-owned noodle counter near ${q}`,
      url: "#",
      content: `Hidden gem locals use after work — neighborhood izakaya energy, family-owned, off the beaten path. Not on Instagram top 10 lists.`,
      score: 0.7,
    },
    {
      title: `Must-see iconic tower for ${q}`,
      url: "#",
      content: `Top 10 TripAdvisor must-see famous landmark — Instagram hotspot, tourist buses, iconic skyline views.`,
      score: 0.92,
    },
    {
      title: `${q} tonight — creator pick`,
      url: "#",
      content: `Travel creator / YouTube vlog favorite: quiet local market stalls, neighborhood fit, walkable from your stay.`,
      score: 0.75,
    },
    {
      title: `Starbucks near ${q} station`,
      url: "#",
      content: `Familiar chain coffee franchise by the station — reliable wifi, tourist-friendly.`,
      score: 0.8,
    },
  ];
}

export function authenticityScore(result: TavilyResult): { touristiness: number; locality: number; uniqueness: number } {
  const lower = result.content.toLowerCase();
  const tourist = /top 10|instagram|must-see|popular|famous|iconic/.test(lower) ? 72 : 28;
  const local = /local|neighborhood|hidden|family-owned|off the beaten/.test(lower) ? 88 : 42;
  const unique = /unique|only|secret|underground/.test(lower) ? 84 : 38;
  return { touristiness: tourist, locality: local, uniqueness: unique };
}
