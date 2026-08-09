import type { Trip, TripItem, TripEdge, Booking, Budget, TripItemKind, TripItemStatus } from "@/server/generated/prisma/client";
import type { SymbolicTripState, TripScore } from "../decision/engine";

export type TripWithGraph = Trip & {
  items: (TripItem & { flight?: unknown; hotel?: unknown })[];
  edges: TripEdge[];
  bookings: Booking[];
  budgets: Budget[];
};

export type { TripItemKind, TripItemStatus };

export interface GraphQuery {
  tripId: string;
  include?: ("items" | "edges" | "bookings" | "budgets" | "alerts")[];
}

export interface AddItemInput {
  kind: TripItemKind;
  title: string;
  status?: TripItemStatus;
  startTime?: Date;
  endTime?: Date;
  location?: string;
  lat?: number;
  lng?: number;
  address?: string;
  provider?: string;
  providerRef?: string;
  confirmationCode?: string;
  payload?: Record<string, unknown>;
}

export interface AddEdgeInput {
  fromId: string;
  toId: string;
  mode?: TripEdge["mode"];
  minutes?: number;
  cost?: number;
  currency?: string;
  reliability?: number;
  walkingMeters?: number;
  accessibility?: Record<string, unknown>;
  carbonKg?: number;
}

export interface TravelerDNA {
  personality: { adventure: number; luxury: number; spontaneity: number; planning: number };
  physical: { walkingTolerance: number; heatTolerance: number; jetLagSeverity: number };
  social: { nightlife: number; crowds: number; touristAttractions: number };
  food: { dietary: string[]; spice: number; fineDining: number; streetFood: number };
  money: { budgetSensitivity: number; hotelPriority: number; experiencePriority: number };
  style: { slowTravel: boolean; localExperiences: boolean; photography: boolean; architecture: boolean };
}

export interface PlanningIntent {
  destination: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  budgetUsd?: number;
  travelers?: number;
  priorities?: Record<string, number>;
  dietary?: string[];
  avoid?: string[];
}

export interface NormalizedTripState {
  symbolic: SymbolicTripState;
  score: TripScore;
  hardViolations: string[];
}
