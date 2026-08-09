/**
 * Trip intake — the contract for what WAYPORT must know before it can plan.
 *
 * Planning silently produced garbage when origin or dates were absent: you
 * cannot price a flight without an origin, and "day 3" is meaningless without a
 * start date. This module names the required fields, extracts what it can from
 * free text, and reports what is still missing so the UI can ask instead of
 * guessing.
 */

export interface TripIntake {
  origin: string;
  destination: string;
  /** ISO yyyy-mm-dd. */
  startDate: string;
  endDate?: string;
  travelers: number;
  budgetUsd?: number;
  purpose?: string;
  title?: string;
  costCenter?: string;
  notes?: string;
}

export type IntakeField = "origin" | "destination" | "startDate";

/** Fields planning cannot proceed without. */
export const REQUIRED_FIELDS: IntakeField[] = ["origin", "destination", "startDate"];

export const FIELD_PROMPT: Record<IntakeField, string> = {
  origin: "Where are you departing from? A city or airport code works.",
  destination: "Where are you going?",
  startDate: "What date does the trip start?",
};

/** Short examples users can append to the description box. */
export const FIELD_HINT: Record<IntakeField, string> = {
  origin: "from SFO",
  destination: "to Lisbon",
  startDate: "on March 14",
};

export interface ParsedIntake {
  origin?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  /** Head-count mentioned in the text. A hint only — the picker owns the party. */
  travelers?: number;
  budgetUsd?: number;
  purpose?: string;
  title?: string;
  costCenter?: string;
  /** Required fields still unknown, in the order they should be asked. */
  missing: IntakeField[];
}

// Common origin airports, so "from SFO" and "from San Francisco" both resolve.
const AIRPORTS: Record<string, string> = {
  "new york": "JFK", nyc: "JFK", brooklyn: "JFK", manhattan: "JFK",
  "san francisco": "SFO", "bay area": "SFO", "the bay": "SFO",
  "silicon valley": "SFO",
  "los angeles": "LAX", la: "LAX", chicago: "ORD", boston: "BOS",
  seattle: "SEA", austin: "AUS", denver: "DEN", atlanta: "ATL",
  miami: "MIA", dallas: "DFW", houston: "IAH", "washington": "IAD",
  london: "LHR", paris: "CDG", amsterdam: "AMS", berlin: "BER",
  madrid: "MAD", barcelona: "BCN", lisbon: "LIS", dublin: "DUB",
  rome: "FCO", milan: "MXP", zurich: "ZRH", munich: "MUC",
  tokyo: "HND", osaka: "KIX", kyoto: "KIX", seoul: "ICN",
  singapore: "SIN", bangkok: "BKK", "hong kong": "HKG", dubai: "DXB",
  sydney: "SYD", melbourne: "MEL", toronto: "YYZ", vancouver: "YVR",
  bangalore: "BLR", bengaluru: "BLR", mumbai: "BOM", delhi: "DEL",
  "mexico city": "MEX", "sao paulo": "GRU", indianapolis: "IND",
};

/** Resolves a free-text place to an IATA code when we recognize it. */
export function toAirportCode(place: string): string | undefined {
  const p = place.trim().toLowerCase();
  if (/^[a-z]{3}$/.test(p)) return p.toUpperCase();
  for (const [name, code] of Object.entries(AIRPORTS)) {
    if (p.includes(name)) return code;
  }
  return undefined;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Best-effort date extraction. Only returns a date it is confident about —
 * a wrong date is worse than asking, because everything downstream is priced
 * and sequenced against it.
 */
export function parseStartDate(text: string, now = new Date()): string | undefined {
  const lower = text.toLowerCase();

  // Prefer an explicit US date (form templates use MM/DD/YYYY).
  const us = parseUsDate(text);
  if (us) return us;

  // 2026-03-14 or 2026/03/14 (year-first only — do not confuse with MM/DD/YYYY)
  const isoMatch = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
    ?? lower.match(/\b(20\d{2})\/(\d{1,2})\/(\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return iso(new Date(Date.UTC(+y, +m - 1, +d)));
  }

  // "mid March" / "early April" / "late June" → approximate day in that month
  const fuzzyMonth = lower.match(
    /\b(early|mid|late)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
  );
  if (fuzzyMonth) {
    const monthName = MONTHS.findIndex((m) =>
      m.startsWith(fuzzyMonth[2].slice(0, 3)),
    );
    if (monthName >= 0) {
      const day =
        fuzzyMonth[1] === "early" ? 5 : fuzzyMonth[1] === "late" ? 25 : 15;
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? +yearMatch[1] : now.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, monthName, day));
      if (!yearMatch && candidate.getTime() < now.getTime() - 86_400_000) {
        candidate.setUTCFullYear(year + 1);
      }
      return iso(candidate);
    }
  }

  // "March 14" / "14 March" / "Mar 14, 2026"
  const monthName = MONTHS.findIndex((m) =>
    new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\b`).test(lower),
  );
  if (monthName >= 0) {
    const dayMatch = lower.match(
      new RegExp(`\\b${MONTHS[monthName].slice(0, 3)}[a-z]*\\.?\\s+(\\d{1,2})\\b`),
    ) ?? lower.match(
      new RegExp(`\\b(\\d{1,2})\\s+${MONTHS[monthName].slice(0, 3)}[a-z]*\\b`),
    );
    if (dayMatch) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? +yearMatch[1] : now.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, monthName, +dayMatch[1]));
      // A bare month/day in the past almost always means next year.
      if (!yearMatch && candidate.getTime() < now.getTime() - 86_400_000) {
        candidate.setUTCFullYear(year + 1);
      }
      return iso(candidate);
    }
  }

  // Relative: "in 3 weeks", "next monday", "tomorrow"
  const rel = lower.match(/\bin\s+(\d+)\s+(day|week|month)s?\b/);
  if (rel) {
    const n = +rel[1];
    const d = new Date(now);
    if (rel[2] === "day") d.setUTCDate(d.getUTCDate() + n);
    if (rel[2] === "week") d.setUTCDate(d.getUTCDate() + n * 7);
    if (rel[2] === "month") d.setUTCMonth(d.getUTCMonth() + n);
    return iso(d);
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return iso(d);
  }
  return undefined;
}

/** `03/14/2027` or `3-14-2027` → ISO. Ignores literal `MM/DD/YYYY` placeholders. */
export function parseUsDate(text: string): string | undefined {
  // Prefer an explicit example in templates: "e.g., 03/14/2027"
  const eg = text.match(
    /\be\.?g\.?\s*[,:]?\s*(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/i,
  );
  if (eg) {
    return iso(new Date(Date.UTC(+eg[3], +eg[1] - 1, +eg[2])));
  }

  const m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (!m) return undefined;
  const month = +m[1];
  const day = +m[2];
  const year = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return iso(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Pull `Label: value` lines from structured paste templates
 * (Trip Name / Departing From / Start Date / …).
 */
export function parseLabeledFields(text: string, now = new Date()): Partial<ParsedIntake> {
  const lineValue = (labels: string[]): string | undefined => {
    for (const label of labels) {
      const re = new RegExp(
        `(?:^|\\n)\\s*${escapeRe(label)}\\s*[:=]\\s*(.+?)\\s*(?=\\n|$)`,
        "i",
      );
      const m = text.match(re);
      if (!m) continue;
      let v = m[1].trim();
      // Drop trailing parenthetical hints only when they are instructions, not
      // airport codes — keep "San Francisco (SFO)".
      if (/^mm\/dd\/yyyy/i.test(v) || /\brequired\b/i.test(v)) {
        // Keep e.g. dates; strip the rest below via parseUsDate.
      } else {
        // Leave IATA parentheses intact for origin.
      }
      if (v) return v;
    }
    return undefined;
  };

  const out: Partial<ParsedIntake> = {};

  const title = lineValue(["Trip Name", "Trip Title", "Name", "Title"]);
  if (title && !/^mm\/dd\/yyyy/i.test(title)) out.title = title.replace(/\s+/g, " ").trim();

  const purposeRaw = lineValue(["Purpose", "Trip Purpose"]);
  if (purposeRaw) {
    out.purpose =
      parsePurpose(purposeRaw) ??
      parsePurpose(`purpose ${purposeRaw}`) ??
      (/off\s*site/i.test(purposeRaw) ? "OFFSITE" : undefined);
  }

  const cc = lineValue(["Cost Center", "Cost Centre", "CC"]);
  if (cc) {
    const code = cc.match(/\b([A-Z]{2,8}[-\s]?\d{2,6})\b/i)?.[1];
    out.costCenter = (code ?? cc).replace(/\s+/g, "-").toUpperCase();
  }

  const budgetRaw = lineValue(["Total Budget", "Budget", "Spend Cap"]);
  if (budgetRaw) out.budgetUsd = parseBudget(budgetRaw) ?? parseBudget(`$${budgetRaw}`);

  const originRaw = lineValue([
    "Departing From",
    "Departure",
    "Origin",
    "From",
    "Leaving From",
  ]);
  if (originRaw) {
    const iata = originRaw.match(/\(([A-Za-z]{3})\)/)?.[1]?.toUpperCase();
    const cleaned = originRaw.replace(/\s*\([A-Za-z]{3}\)\s*/g, " ").trim();
    out.origin = iata ?? toAirportCode(cleaned) ?? cleaned;
  }

  const destRaw = lineValue(["Destination", "Going To", "To"]);
  if (destRaw) {
    out.destination = destRaw
      .replace(/\s*\([^)]*required[^)]*\)\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const startRaw = lineValue(["Start Date", "Departure Date", "Begin Date"]);
  if (startRaw) out.startDate = parseUsDate(startRaw) ?? parseStartDate(startRaw, now);

  const endRaw = lineValue(["End Date", "Return Date", "Arrival Date"]);
  if (endRaw) out.endDate = parseUsDate(endRaw) ?? parseStartDate(endRaw, now);

  return out;
}

/** Words that end a place name — everything after them belongs to another clause. */
const CLAUSE_END =
  "from|leaving|departing|out of|on|for|with|next|starting|beginning|budget|\\$";

/**
 * Pulls the destination out of "offsite in Lisbon", "trip to Tokyo".
 *
 * `originSpan` is the slice already claimed by the origin, so "from SFO to
 * Lisbon" cannot read SFO as the destination.
 */
export function parseDestination(text: string, originSpan?: string): string | undefined {
  // Remove the origin clause outright — it is the main source of false matches.
  const cleaned = originSpan
    ? text.replace(
        new RegExp(`\\b(from|leaving|departing|out of)\\s+${escapeRe(originSpan)}\\b`, "i"),
        " ",
      )
    : text;

  const patterns = [
    new RegExp(`\\b(?:to|in|at)\\s+([A-Za-z][A-Za-z\\s'’.-]{1,30}?)(?=\\s+(?:${CLAUSE_END})\\b|[,.]|$)`, "i"),
  ];

  for (const re of patterns) {
    const m = cleaned.match(re);
    const raw = m?.[1]?.trim();
    // "in 3 weeks" is a date, not a place.
    if (raw && !/^\d/.test(raw) && !/^(the|a|an)$/i.test(raw)) {
      return titleCase(raw);
    }
  }

  // Fall back to any city we recognize that isn't the origin.
  const lower = cleaned.toLowerCase();
  for (const name of Object.keys(AIRPORTS).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`(^|[^a-z])${escapeRe(name)}([^a-z]|$)`, "i").test(lower)) {
      return titleCase(name);
    }
  }
  return undefined;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const PURPOSE_WORDS: [RegExp, string][] = [
  [/\boff-?site\b/i, "OFFSITE"],
  [/\bconferenc/i, "CONFERENCE"],
  [/\bclient\s+(visit|meeting)\b/i, "CLIENT_VISIT"],
  [/\bcustomer\s+visit\b/i, "CLIENT_VISIT"],
  [/\btraining\b/i, "TRAINING"],
  [/\brecruit/i, "RECRUITING"],
  [/\bonsite\b/i, "OFFSITE"],
  [/\bsummit\b/i, "CONFERENCE"],
];

/** Detects trip purpose so the policy tier and approval routing start right. */
export function parsePurpose(text: string): string | undefined {
  for (const [re, purpose] of PURPOSE_WORDS) {
    if (re.test(text)) return purpose;
  }
  return undefined;
}

/** Stop origin capture before dates / durations so "from the bay mid march" works. */
const ORIGIN_STOP =
  "to|on|for|with|in|at|next|starting|beginning|budget|early|mid|late|" +
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|" +
  "aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** Pulls an origin out of phrasing like "from SFO" or "leaving San Francisco". */
export function parseOrigin(text: string): string | undefined {
  const patterns = [
    new RegExp(
      `\\bfrom\\s+([A-Za-z][A-Za-z\\s]{0,24}?)(?=\\s+(?:${ORIGIN_STOP})\\b|[,.]|$)`,
      "i",
    ),
    new RegExp(
      `\\bleaving\\s+(?:from\\s+)?([A-Za-z][A-Za-z\\s]{0,24}?)(?=\\s+(?:${ORIGIN_STOP})\\b|[,.]|$)`,
      "i",
    ),
    new RegExp(
      `\\bdeparting\\s+(?:from\\s+)?([A-Za-z][A-Za-z\\s]{0,24}?)(?=\\s+(?:${ORIGIN_STOP})\\b|[,.]|$)`,
      "i",
    ),
    new RegExp(
      `\\bout\\s+of\\s+([A-Za-z][A-Za-z\\s]{0,24}?)(?=\\s+(?:${ORIGIN_STOP})\\b|[,.]|$)`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const raw = m[1].trim().replace(/\s+/g, " ");
      if (!raw || /^(the|a|an)$/i.test(raw)) continue;
      return toAirportCode(raw) ?? raw.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  // A bare IATA code anywhere ("SFO -> LIS").
  const bare = text.match(/\b([A-Z]{3})\s*(?:->|→|to)\s*[A-Z]{3}\b/);
  if (bare) return bare[1];
  return undefined;
}

/**
 * Extracts everything it can and reports what still has to be asked.
 *
 * Values found in `text` win over `known` — Fill fields means apply this
 * description. `known` only fills gaps the sentence does not mention.
 * Labeled form paste (`Trip Name: …`, `Departing From: …`) wins over prose.
 */
export function parseIntake(
  text: string,
  known: Partial<TripIntake> = {},
  now = new Date(),
): ParsedIntake {
  const labeled = parseLabeledFields(text, now);

  // Prefer fresh extracted values so editing the box and re-clicking updates fields.
  let origin = labeled.origin ?? parseOrigin(text) ?? known.origin;
  let startDate = labeled.startDate ?? parseStartDate(text, now) ?? known.startDate;
  let destination = labeled.destination ?? parseDestination(text, origin) ?? known.destination;

  const durationMatch = text.toLowerCase().match(/(\d+)\s*(day|night|week)s?/);
  const durationDays = durationMatch
    ? +durationMatch[1] * (durationMatch[2] === "week" ? 7 : 1)
    : undefined;

  const budgetUsd = labeled.budgetUsd ?? parseBudget(text) ?? known.budgetUsd;

  const peopleMatch = text.match(
    /\b(\d+)\s*(?:people|ppl|travelers|travellers|attendees|of us)\b/i,
  );
  const travelers = peopleMatch ? +peopleMatch[1] : known.travelers;

  const purpose = labeled.purpose ?? parsePurpose(text) ?? known.purpose;
  const costCenter = labeled.costCenter ?? parseCostCenter(text) ?? known.costCenter;

  let endDate = labeled.endDate ?? parseEndDate(text, now) ?? known.endDate;
  if (!endDate && startDate && durationDays) {
    const d = new Date(`${startDate}T00:00:00Z`);
    // "for 4 days" → return on day 4 (start + 3) feels wrong for budget trips;
    // treat duration as inclusive span ending on start + N days.
    d.setUTCDate(d.getUTCDate() + durationDays);
    endDate = iso(d);
  }

  // Short follow-up aimed at the next missing required field (matches the UI prompt).
  const nextMissing = REQUIRED_FIELDS.find((f) =>
    f === "origin" ? !origin : f === "startDate" ? !startDate : !destination,
  );
  const followUp = nextMissing ? lastFollowUpFragment(text) : undefined;
  if (followUp && nextMissing === "origin" && !labeled.origin && !parseOrigin(text)) {
    const asOrigin =
      toAirportCode(followUp) ?? (looksLikePlace(followUp) ? titleCase(followUp) : undefined);
    if (asOrigin) origin = asOrigin;
  } else if (
    followUp &&
    nextMissing === "destination" &&
    !labeled.destination &&
    !parseDestination(text, origin)
  ) {
    const asDest =
      parseDestination(`to ${followUp}`) ??
      (looksLikePlace(followUp) ? titleCase(followUp) : undefined);
    if (asDest) destination = asDest;
  } else if (
    followUp &&
    nextMissing === "startDate" &&
    !labeled.startDate &&
    !parseStartDate(text, now)
  ) {
    startDate = parseStartDate(followUp, now) ?? startDate;
  }

  if (!endDate && startDate && durationDays) {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + durationDays);
    endDate = iso(d);
  }

  const title =
    labeled.title ??
    parseExplicitTitle(text) ??
    suggestTitle({ purpose, destination, text }) ??
    known.title;

  const missing = REQUIRED_FIELDS.filter((f) =>
    f === "origin" ? !origin : f === "startDate" ? !startDate : !destination,
  );

  return {
    origin,
    destination,
    startDate,
    endDate,
    durationDays,
    travelers,
    budgetUsd,
    purpose,
    title,
    costCenter,
    missing,
  };
}

/** `$32,000`, `32000`, `budget 32k`, `around 32k`. */
export function parseBudget(text: string): number | undefined {
  const withSymbol = text.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)\s*(k)?/i);
  if (withSymbol) {
    return parseFloat(withSymbol[1].replace(/,/g, "")) * (withSymbol[2] ? 1000 : 1);
  }
  const labeled = text.match(
    /\b(?:budget|spend|cap|around|about|roughly|~)\s*(?:of|is|:)?\s*\$?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(k)?\b/i,
  );
  if (labeled) {
    return parseFloat(labeled[1].replace(/,/g, "")) * (labeled[2] ? 1000 : 1);
  }
  return undefined;
}

/** `ENG-1042`, `cost center ENG-1042`. */
export function parseCostCenter(text: string): string | undefined {
  const labeled = text.match(
    /\b(?:cost\s*center|cc|gl)\s*[:=]?\s*([A-Z]{2,8}[-\s]?\d{2,6})\b/i,
  );
  if (labeled) return labeled[1].replace(/\s+/g, "-").toUpperCase();
  const bare = text.match(/\b([A-Z]{2,6}-\d{3,6})\b/);
  if (bare) return bare[1].toUpperCase();
  return undefined;
}

/** Explicit end phrasing: until / through / ending March 18. */
export function parseEndDate(text: string, now = new Date()): string | undefined {
  const m = text.match(
    /\b(?:until|through|thru|ending|ends?(?:\s+on)?|return(?:ing)?)\s+([^,.;]+?)(?=\s+(?:from|with|budget|for|,)|[,.]|$)/i,
  );
  if (m) return parseStartDate(m[1], now);
  return undefined;
}

/** `titled "…"`, `name: …`, `called …`. */
export function parseExplicitTitle(text: string): string | undefined {
  const m =
    text.match(/\b(?:title|named|called|trip\s*name)\s*[:=]?\s*["“]([^"”]+)["”]/i) ??
    text.match(/\b(?:title|named|called|trip\s*name)\s*[:=]\s*([A-Za-z0-9][^,.\n]{2,60})/i);
  return m?.[1]?.trim();
}

const TITLE_PURPOSE: Record<string, string> = {
  OFFSITE: "Offsite",
  CONFERENCE: "Conference",
  CLIENT_VISIT: "Client visit",
  TRAINING: "Training",
  RECRUITING: "Recruiting",
};

/** Builds a trip name from purpose + destination when the text implies one. */
export function suggestTitle(opts: {
  purpose?: string;
  destination?: string;
  text?: string;
}): string | undefined {
  const { purpose, destination, text = "" } = opts;
  if (!destination) return undefined;

  const dept = text.match(
    /\b(engineering|product|design|sales|marketing|finance|ops|operations|executive|hr)\b/i,
  );

  if (purpose === "OFFSITE" || /\boff-?site\b/i.test(text)) {
    if (dept) return `${titleCase(dept[1])} Offsite — ${destination}`;
    return `Team offsite — ${destination}`;
  }

  const base = (purpose && TITLE_PURPOSE[purpose]) || "Trip";
  return `${base} — ${destination}`;
}

/** Last line or trailing clause — what users usually append when prompted. */
function lastFollowUpFragment(text: string): string | undefined {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const last = lines[lines.length - 1]!;
    if (last.length <= 60) return last.replace(/^[,.\-\s]+/, "").trim();
  }
  // Trailing after a period / em dash / semicolon
  const trail = text.match(/(?:[.!?;—–]\s*|,\s+)([A-Za-z0-9][^.!?;]{0,50})$/);
  if (trail) return trail[1].trim();
  // Whole text is a short answer on its own
  const trimmed = text.trim();
  if (trimmed.length > 0 && trimmed.length <= 40 && !/\b(for|people|budget|\$)\b/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function looksLikePlace(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/^\d/.test(t)) return false;
  if (/\b(day|week|night|people|budget)\b/i.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s'’.-]*$/.test(t);
}

/** The next question to ask, or null when intake is complete. */
export function nextPrompt(missing: IntakeField[]): string | null {
  return missing.length ? FIELD_PROMPT[missing[0]] : null;
}
