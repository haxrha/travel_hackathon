/**
 * Gemini-assisted trip intake — understands messy / unnatural free text,
 * then merges with the deterministic parser so regex still wins on clear
 * airport codes and ISO dates.
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  parseIntake,
  REQUIRED_FIELDS,
  toAirportCode,
  type ParsedIntake,
  type TripIntake,
} from "./intake";

const geminiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || "";

const IntakeLlmSchema = z.object({
  origin: z
    .string()
    .nullable()
    .describe("Departure city or IATA code, e.g. SFO or San Francisco"),
  destination: z
    .string()
    .nullable()
    .describe("Destination city/country, e.g. Lisbon, Portugal"),
  startDate: z
    .string()
    .nullable()
    .describe("Trip start as YYYY-MM-DD if a date can be inferred"),
  endDate: z
    .string()
    .nullable()
    .describe("Trip end as YYYY-MM-DD if stated or computable from duration"),
  durationDays: z.number().int().nullable().optional(),
  travelers: z.number().int().nullable().optional(),
  budgetUsd: z.number().nullable().optional(),
  purpose: z
    .enum(["OFFSITE", "CONFERENCE", "CLIENT_VISIT", "TRAINING", "RECRUITING"])
    .nullable()
    .optional(),
  title: z.string().nullable().optional(),
  costCenter: z
    .string()
    .nullable()
    .optional()
    .describe("Cost center like ENG-1042 if mentioned"),
});

function getModel() {
  if (!geminiKey) return null;
  // Ensure the AI SDK sees a key even when only GOOGLE_API_KEY is set.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY;
  }
  // 2.0-flash free-tier quota is often exhausted; flash-latest / 3-flash work.
  return google("gemini-flash-latest");
}

function cleanStr(v: string | null | undefined): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  if (!t || /^(null|none|n\/a|unknown|tbd)$/i.test(t)) return undefined;
  return t;
}

function isIata(v?: string | null): boolean {
  return !!v && /^[A-Z]{3}$/.test(v.trim());
}

function isIsoDate(v?: string | null): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function cleanDate(v: string | null | undefined): string | undefined {
  const t = cleanStr(v);
  if (!t) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const us = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  if (us) {
    return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2])).toISOString().slice(0, 10);
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

async function parseIntakeWithGemini(
  text: string,
  now = new Date(),
): Promise<Partial<ParsedIntake> | null> {
  const model = getModel();
  if (!model || !text.trim()) return null;

  try {
    const { object } = await generateObject({
      model,
      schema: IntakeLlmSchema,
      abortSignal: AbortSignal.timeout(12_000),
      prompt: `Extract structured trip intake fields from travel text.
Today's date is ${now.toISOString().slice(0, 10)} (use this year if the month/day is in the past without a year).
Return null for any field you cannot confidently extract — do not invent cities or dates.
Normalize dates to YYYY-MM-DD. Prefer IATA codes for origins when clear (SFO, JFK).
Purpose must be one of OFFSITE, CONFERENCE, CLIENT_VISIT, TRAINING, RECRUITING when implied (offsite, summit, client visit, etc.).

The text may be a labeled form paste like:
Trip Name: …
Purpose: Team offsite
Cost Center: ENG-1042
Total Budget: $32,000 USD
Departing From: San Francisco (SFO)
Destination: Lisbon, Portugal
Start Date: MM/DD/YYYY (Required — e.g., 03/14/2027)
End Date: 03/18/2027
For Start/End Date lines, use the filled date or the e.g. example if the value is still the MM/DD/YYYY placeholder.

Text:
"""
${text}
"""`,
    });

    return {
      origin: (() => {
        const o = cleanStr(object.origin);
        return o ? toAirportCode(o) ?? o : undefined;
      })(),
      destination: cleanStr(object.destination),
      startDate: cleanDate(object.startDate),
      endDate: cleanDate(object.endDate),
      durationDays: object.durationDays ?? undefined,
      travelers: object.travelers ?? undefined,
      budgetUsd: object.budgetUsd ?? undefined,
      purpose: object.purpose ?? undefined,
      title: cleanStr(object.title),
      costCenter: cleanStr(object.costCenter)?.toUpperCase(),
    };
  } catch (e) {
    console.warn("[intake-ai] Gemini parse failed, using regex only", e);
    return null;
  }
}

/**
 * Hybrid intake: deterministic parser first, Gemini fills gaps / corrects
 * unnatural phrasing. Values already in `known` stay unless the text clearly
 * supplies a replacement (Gemini + regex both beat empty known).
 */
export async function parseIntakeSmart(
  text: string,
  known: Partial<TripIntake> = {},
  now = new Date(),
): Promise<ParsedIntake & { source: "hybrid" | "regex" | "gemini" }> {
  const regex = parseIntake(text, {}, now);
  const labeledForm = /\b(trip\s*name|departing\s*from|start\s*date|total\s*budget)\s*[:=]/i.test(
    text,
  );
  // Structured paste is deterministic — skip Gemini unless regex still lacks required fields.
  const llm =
    labeledForm && regex.missing.length === 0
      ? null
      : await parseIntakeWithGemini(text, now);

  const pick = <T,>(...vals: (T | undefined | null)[]): T | undefined => {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && !v.trim()) continue;
      if (typeof v === "number" && Number.isNaN(v)) continue;
      return v as T;
    }
    return undefined;
  };

  // Labeled forms: regex wins. Messy prose: Gemini fills gaps / fuzzy phrasing.
  const origin = labeledForm || isIata(regex.origin)
    ? pick(regex.origin, llm?.origin, known.origin)
    : pick(llm?.origin, regex.origin, known.origin);
  const destination = labeledForm
    ? pick(regex.destination, llm?.destination, known.destination)
    : pick(llm?.destination, regex.destination, known.destination);
  const startDate = labeledForm || isIsoDate(regex.startDate)
    ? pick(regex.startDate, llm?.startDate, known.startDate)
    : pick(llm?.startDate, regex.startDate, known.startDate);
  let endDate = labeledForm
    ? pick(regex.endDate, llm?.endDate, known.endDate)
    : pick(llm?.endDate, regex.endDate, known.endDate);
  const durationDays = pick(regex.durationDays, llm?.durationDays);
  const budgetUsd = pick(regex.budgetUsd, llm?.budgetUsd, known.budgetUsd);
  const travelers = pick(regex.travelers, llm?.travelers, known.travelers);
  const purpose = pick(regex.purpose, llm?.purpose, known.purpose);
  const title = labeledForm
    ? pick(regex.title, llm?.title, known.title)
    : pick(llm?.title, regex.title, known.title);
  const costCenter = pick(regex.costCenter, llm?.costCenter, known.costCenter);

  if (!endDate && startDate && durationDays) {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + durationDays);
    endDate = d.toISOString().slice(0, 10);
  }
  // Repair LLM end dates that landed before start (year drift).
  if (endDate && startDate && endDate < startDate && durationDays) {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + durationDays);
    endDate = d.toISOString().slice(0, 10);
  } else if (endDate && startDate && endDate < startDate) {
    endDate = undefined;
  }

  const missing = REQUIRED_FIELDS.filter((f) =>
    f === "origin" ? !origin : f === "startDate" ? !startDate : !destination,
  );

  const source =
    llm && (regex.origin || regex.destination || regex.startDate)
      ? "hybrid"
      : llm
        ? "gemini"
        : "regex";

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
    source,
  };
}
