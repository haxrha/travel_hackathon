/** Durable traveler facts shared by Backboard Auto and the local mirror. */

export type FactKind = "seat" | "diet" | "schedule" | "budget" | "access" | "other";

export type MemorySource = "backboard" | "local";

export type TravelerFact = {
  id: string;
  content: string;
  kind: FactKind;
  source: MemorySource;
  tripId?: string;
  createdAt: string;
  /** Set when the fact is a hotel nightly ceiling. */
  nightlyUsd?: number;
  seat?: "aisle" | "window";
  diet?: string;
  avoidsRedEye?: boolean;
  backboardMemoryId?: string;
};

export type TravelerMemoryBinding = {
  assistantId?: string;
  /** trip id → Backboard thread. A new trip omits the previous thread. */
  threads: Record<string, string>;
  facts: TravelerFact[];
};

export type MemoryTurn = {
  configured: boolean;
  provider: "backboard" | "local";
  assistantId?: string;
  threadId?: string;
  /** Facts already stored before this message. */
  recalled: TravelerFact[];
  /** Facts first seen in this message. */
  learned: TravelerFact[];
  /** Union the planner and financial agent apply. */
  applied: TravelerFact[];
  /** Backboard memory mode used for the write, when a write ran. */
  memoryMode?: "Auto";
  error?: string;
};
