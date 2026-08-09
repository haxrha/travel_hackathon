/**
 * 3D Travel Decision Graph — data model + search-space generator.
 */

export type CategoryType =
  | "hotel"
  | "restaurant"
  | "flight"
  | "attraction"
  | "place"
  | "activity"
  | "event"
  | "transportation";

export type GraphCategory = {
  id: string;
  type: CategoryType;
  label: string;
  position: [number, number, number];
};

export type GraphSubcategory = {
  id: string;
  parentId: string;
  label: string;
  position: [number, number, number];
};

export type GraphCandidate = {
  id: string;
  parentId: string;
  subcategoryId: string;
  label: string;
  metadata: {
    priceUsd?: number;
    rating?: number;
    location?: string;
    match?: number;
    locationScore?: number;
    budgetScore?: number;
    prefsScore?: number;
    availabilityScore?: number;
    alternatives?: number;
    reasonFactors?: string[];
  };
  score: number;
  selected: boolean;
  position: [number, number, number];
};

export type GraphRelationship = {
  id: string;
  source: string;
  target: string;
  type: "contains" | "candidate" | "selected" | "itinerary";
};

export type DecisionGraphData = {
  categories: GraphCategory[];
  subcategories: GraphSubcategory[];
  candidates: GraphCandidate[];
  relationships: GraphRelationship[];
  selectedIds: string[];
  destination: string;
};

const CATEGORY_DEFS: { type: CategoryType; label: string; angle: number; radius: number; y: number }[] = [
  { type: "hotel", label: "Hotels", angle: -0.4, radius: 14, y: 3.2 },
  { type: "flight", label: "Flights", angle: 0.5, radius: 15, y: 2.6 },
  { type: "restaurant", label: "Restaurants", angle: 1.9, radius: 13.5, y: 1.0 },
  { type: "attraction", label: "Attractions", angle: 2.75, radius: 14.5, y: 2.9 },
  { type: "activity", label: "Activities", angle: 3.6, radius: 13, y: 0.4 },
  { type: "place", label: "Places to Visit", angle: 4.45, radius: 14.2, y: -0.9 },
  { type: "event", label: "Events", angle: 5.25, radius: 12.8, y: 1.7 },
  { type: "transportation", label: "Transportation", angle: 5.95, radius: 11.8, y: -1.5 },
];

const SUBS: Record<CategoryType, string[]> = {
  hotel: ["Luxury", "Boutique", "Budget", "Business", "Family", "Resort", "Downtown", "Airport"],
  restaurant: ["Italian", "Japanese", "Indian", "Mexican", "American", "Fine Dining", "Casual", "Vegetarian", "Late Night"],
  flight: ["Nonstop", "1 Stop", "Morning", "Afternoon", "Evening", "Cheapest", "Fastest"],
  attraction: ["Museums", "Landmarks", "Parks", "Shopping", "Entertainment", "Architecture", "Cultural"],
  place: ["Neighborhoods", "Downtown", "Waterfront", "Historic District", "Arts District", "Hidden Gems"],
  activity: ["Walking", "Food Tours", "Workshops", "Outdoor", "Wellness", "Nightlife"],
  event: ["Concerts", "Festivals", "Theater", "Sports", "Markets"],
  transportation: ["Rail", "Metro", "Rideshare", "Walking", "Transfer", "Rental"],
};

const NAME_BANKS: Record<CategoryType, string[]> = {
  hotel: [
    "Park Hyatt", "The Plaza", "St. Regis", "Four Seasons", "Mandarin Oriental", "1 Hotel",
    "Edition", "Aman", "Solstice House", "Ember Lofts", "The Meridian", "Harbor Suites",
    "Cedar Court", "Velvet Stay", "Skyline Rooms", "Lumen Hotel", "Atlas Lodge", "Quiet Wing",
  ],
  restaurant: [
    "Nami Counter", "Osteria Verde", "Spice Lane", "Casa Sol", "Harbor Grill", "Night Owl Ramen",
    "Garden Table", "Ember Kitchen", "Local Fork", "Silk & Salt", "Blue Lantern", "Corner Izakaya",
  ],
  flight: ["AA 112", "UA 441", "DL 908", "JL 5", "NH 9", "BA 178", "AF 22", "EK 201", "QR 701", "SQ 26"],
  attraction: [
    "City Museum", "Old Tower", "River Park", "Grand Market", "Art Pavilion", "Castle Ruins",
    "Design District Walk", "Observatory", "Botanic Gardens", "Street Art Lane",
  ],
  place: ["Arts Quarter", "Old Town", "Waterfront Pier", "Hillside Ward", "Temple Row", "Canal Belt"],
  activity: ["Dawn Walk", "Cooking Class", "Tea Ceremony", "Kayak Loop", "Night Market Hop", "Spa Hour"],
  event: ["Jazz Under Lights", "Night Market", "Open-Air Cinema", "Local Match", "Craft Fair"],
  transportation: ["Airport Express", "Metro Day Pass", "Private Transfer", "Harbor Ferry", "Bike Share"],
};

const KIND_TO_TYPE: Record<string, CategoryType> = {
  HOTEL: "hotel",
  RESTAURANT: "restaurant",
  FLIGHT: "flight",
  LANDMARK: "attraction",
  ACTIVITY: "activity",
  EXPERIENCE: "activity",
  EVENT: "event",
  TRANSFER: "transportation",
  TRANSIT: "transportation",
  CUSTOM: "place",
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polar(angle: number, radius: number, y: number): [number, number, number] {
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function orbitAround(
  center: [number, number, number],
  i: number,
  n: number,
  radius: number,
  yJitter: number,
  rng: () => number,
): [number, number, number] {
  const a = (i / Math.max(1, n)) * Math.PI * 2 + rng() * 0.4;
  const r = radius * (0.72 + rng() * 0.5);
  return [center[0] + Math.cos(a) * r, center[1] + (rng() - 0.5) * yJitter, center[2] + Math.sin(a) * r];
}

type TripItemLike = {
  id: string;
  kind: string;
  title: string;
  payload?: { priceUsd?: number; description?: string } | null;
  location?: string | null;
};

export function buildDecisionGraph(
  trip: { id: string; destination: string; title: string; items: TripItemLike[] },
  opts: { candidatesPerSub?: number } = {},
): DecisionGraphData {
  const perSub = opts.candidatesPerSub ?? 8;
  const rng = mulberry32(hash(trip.id + "|" + trip.destination));

  const categories: GraphCategory[] = CATEGORY_DEFS.map((c) => ({
    id: `cat-${c.type}`,
    type: c.type,
    label: c.label,
    position: polar(c.angle, c.radius, c.y),
  }));

  const subcategories: GraphSubcategory[] = [];
  const candidates: GraphCandidate[] = [];
  const relationships: GraphRelationship[] = [];
  const selectedIds: string[] = [];

  const typeCursor = new Map<CategoryType, number>();

  for (const cat of categories) {
    const subs = SUBS[cat.type];
    subs.forEach((label, si) => {
      const subId = `${cat.id}-sub-${si}`;
      const pos = orbitAround(cat.position, si, subs.length, 3.35, 1.5, rng);
      subcategories.push({ id: subId, parentId: cat.id, label, position: pos });
      relationships.push({ id: `rel-${cat.id}-${subId}`, source: cat.id, target: subId, type: "contains" });

      const bank = NAME_BANKS[cat.type];
      const count = perSub + Math.floor(rng() * 5);
      for (let ci = 0; ci < count; ci++) {
        const id = `${subId}-c-${ci}`;
        const score = 38 + Math.floor(rng() * 48);
        candidates.push({
          id,
          parentId: cat.id,
          subcategoryId: subId,
          label: `${bank[Math.floor(rng() * bank.length)]}${cat.type === "flight" ? "" : ` ${10 + Math.floor(rng() * 80)}`}`,
          score,
          selected: false,
          position: orbitAround(pos, ci, count, 2.35, 1.15, rng),
          metadata: {
            priceUsd: Math.round(35 + rng() * 520),
            rating: Math.round((3.1 + rng() * 1.8) * 10) / 10,
            location: trip.destination,
            match: score,
            locationScore: Math.round(60 + rng() * 35),
            budgetScore: Math.round(55 + rng() * 40),
            prefsScore: Math.round(58 + rng() * 38),
            availabilityScore: Math.round(62 + rng() * 35),
            alternatives: count - 1,
          },
        });
        relationships.push({ id: `rel-${subId}-${id}`, source: subId, target: id, type: "candidate" });
      }
    });
  }

  // Inject selected trip items — pull forward from their category galaxy
  for (const it of trip.items) {
    const type = KIND_TO_TYPE[it.kind] ?? "place";
    const cat = categories.find((c) => c.type === type)!;
    const subsOf = subcategories.filter((s) => s.parentId === cat.id);
    const cursor = typeCursor.get(type) ?? 0;
    const sub = subsOf[cursor % subsOf.length]!;
    typeCursor.set(type, cursor + 1);

    const id = `sel-${it.id}`;
    const score = 88 + Math.floor(rng() * 11);
    const base = orbitAround(sub.position, 0, 1, 1.55, 0.5, rng);
    // Pull toward viewer / origin
    const position: [number, number, number] = [base[0] * 0.82, base[1] + 0.7, base[2] * 0.82];

    candidates.push({
      id,
      parentId: cat.id,
      subcategoryId: sub.id,
      label: it.title,
      score,
      selected: true,
      position,
      metadata: {
        priceUsd: it.payload?.priceUsd ?? Math.round(90 + rng() * 300),
        rating: Math.round((4.2 + rng() * 0.7) * 10) / 10,
        location: it.location ?? trip.destination,
        match: score,
        locationScore: Math.round(88 + rng() * 11),
        budgetScore: Math.round(84 + rng() * 14),
        prefsScore: Math.round(90 + rng() * 9),
        availabilityScore: Math.round(82 + rng() * 16),
        alternatives: 6 + Math.floor(rng() * 10),
        reasonFactors: ["Traveler DNA", "Budget", "Schedule fit", "Localness"].slice(0, 2 + Math.floor(rng() * 2)),
      },
    });
    selectedIds.push(id);
    relationships.push({ id: `rel-sel-${id}`, source: sub.id, target: id, type: "selected" });
  }

  const ordered = trip.items
    .map((it) => candidates.find((c) => c.id === `sel-${it.id}`))
    .filter(Boolean) as GraphCandidate[];
  for (let i = 0; i < ordered.length - 1; i++) {
    relationships.push({
      id: `itin-${i}`,
      source: ordered[i].id,
      target: ordered[i + 1].id,
      type: "itinerary",
    });
  }

  return { categories, subcategories, candidates, relationships, selectedIds, destination: trip.destination };
}
