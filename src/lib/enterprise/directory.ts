/**
 * Company traveler directory.
 *
 * The people an organizer picks from when building a trip. Kept separate from
 * Attendee: a directory entry is who someone *is* (home airport, dietary needs,
 * loyalty numbers), while an Attendee is that person *on a specific trip* (RSVP,
 * flights, room). Adding someone to a trip projects the former onto the latter,
 * so their standing details never have to be retyped.
 */

import type { Attendee } from "./program";

export interface DirectoryTraveler {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  homeCity: string;
  homeAirport: string;
  lat?: number;
  lng?: number;
  dietary?: string[];
  accessibility?: string[];
  seatPreference?: Attendee["seatPreference"];
  loyaltyNumbers?: Record<string, string>;
  knownTravelerNumber?: string;
  airlinePreference?: string;
}

const DIRECTORY: DirectoryTraveler[] = [
  // Northwind engineering / product / data
  { id: "dir-dana", name: "Dana Whitfield", email: "dana@northwind.co", department: "Engineering", title: "VP Engineering", homeCity: "San Francisco", homeAirport: "SFO", lat: 37.6213, lng: -122.379 },
  { id: "dir-marcus", name: "Marcus Chen", email: "marcus@northwind.co", department: "Engineering", title: "Staff Engineer", homeCity: "San Francisco", homeAirport: "SFO", lat: 37.6213, lng: -122.379 },
  { id: "dir-priya-r", name: "Priya Raghunathan", email: "priya.r@northwind.co", department: "Engineering", title: "Engineering Manager", homeCity: "New York", homeAirport: "JFK", lat: 40.6413, lng: -73.7781 },
  { id: "dir-tomas", name: "Tomás Oliveira", email: "tomas@northwind.co", department: "Design", title: "Principal Designer", homeCity: "New York", homeAirport: "JFK", lat: 40.6413, lng: -73.7781, dietary: ["vegetarian"] },
  { id: "dir-sarah", name: "Sarah Lindqvist", email: "sarah@northwind.co", department: "Product", title: "Group PM", homeCity: "London", homeAirport: "LHR", lat: 51.47, lng: -0.4543 },
  { id: "dir-owen", name: "Owen Baptiste", email: "owen@northwind.co", department: "Product", title: "PM", homeCity: "London", homeAirport: "LHR", lat: 51.47, lng: -0.4543, accessibility: ["step-free room"] },
  { id: "dir-nadia", name: "Nadia Haddad", email: "nadia@northwind.co", department: "Engineering", title: "Senior Engineer", homeCity: "Chicago", homeAirport: "ORD", lat: 41.9742, lng: -87.9073 },
  { id: "dir-ben", name: "Ben Arkwright", email: "ben@northwind.co", department: "Engineering", title: "Engineer", homeCity: "Seattle", homeAirport: "SEA", lat: 47.4502, lng: -122.3088 },
  { id: "dir-grace", name: "Grace Mbeki", email: "grace@northwind.co", department: "Data", title: "Analytics Lead", homeCity: "Amsterdam", homeAirport: "AMS", lat: 52.3105, lng: 4.7683 },
  { id: "dir-felix", name: "Felix Toure", email: "felix@northwind.co", department: "Data", title: "Data Engineer", homeCity: "Amsterdam", homeAirport: "AMS", lat: 52.3105, lng: 4.7683 },
  { id: "dir-isabel", name: "Isabel Moreau", email: "isabel@northwind.co", department: "Design", title: "Designer", homeCity: "Paris", homeAirport: "CDG", lat: 49.0097, lng: 2.5479 },
  { id: "dir-ravi", name: "Ravi Anand", email: "ravi@northwind.co", department: "Engineering", title: "Engineer", homeCity: "Bengaluru", homeAirport: "BLR", lat: 13.1986, lng: 77.7066 },

  // DACH team — the travelers referenced by the SF onsite proposal.
  {
    id: "dir-jonas", name: "Jonas Becker", email: "jonas@northwind.co",
    department: "Engineering", title: "Senior Engineer",
    homeCity: "Berlin", homeAirport: "BER", lat: 52.3666, lng: 13.5033,
    dietary: ["vegetarian"], seatPreference: "aisle",
    loyaltyNumbers: { "Miles & More": "LH4471203" },
    airlinePreference: "Lufthansa",
  },
  {
    id: "dir-priya-s", name: "Priya Sharma", email: "priya.s@northwind.co",
    department: "Product", title: "Product Manager",
    homeCity: "Berlin", homeAirport: "BER", lat: 52.3666, lng: 13.5033,
    seatPreference: "window",
    knownTravelerNumber: "KTN-98213765",
  },
  {
    id: "dir-tom", name: "Tom Weiss", email: "tom@northwind.co",
    department: "Engineering", title: "Engineering Manager",
    homeCity: "Munich", homeAirport: "MUC", lat: 48.3538, lng: 11.7861,
    accessibility: ["wheelchair-accessible room"],
  },
  {
    id: "dir-lena", name: "Lena Fischer", email: "lena@northwind.co",
    department: "Design", title: "Design Lead",
    homeCity: "Berlin", homeAirport: "BER", lat: 52.3666, lng: 13.5033,
    dietary: ["lactose intolerant"], seatPreference: "aisle",
    loyaltyNumbers: { "Miles & More": "LH1029384", "Marriott Bonvoy": "MB55291002" },
    airlinePreference: "Lufthansa",
  },
];

export function listDirectory(): DirectoryTraveler[] {
  return [...DIRECTORY].sort((a, b) => a.name.localeCompare(b.name));
}

export function findDirectoryTraveler(id: string): DirectoryTraveler | undefined {
  return DIRECTORY.find((d) => d.id === id);
}

export function findDirectoryByEmail(email: string): DirectoryTraveler | undefined {
  const key = email.trim().toLowerCase();
  return DIRECTORY.find((d) => d.email.toLowerCase() === key);
}

/** Everyone who has been added to the directory, grouped for the picker UI. */
export function directoryByDepartment(): [string, DirectoryTraveler[]][] {
  const map = new Map<string, DirectoryTraveler[]>();
  for (const d of listDirectory()) {
    const list = map.get(d.department);
    if (list) list.push(d);
    else map.set(d.department, [d]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Projects a directory entry into a trip attendee with no travel booked yet. */
export function toAttendee(d: DirectoryTraveler): Attendee {
  return {
    id: `att-${d.id}`,
    name: d.name,
    email: d.email,
    department: d.department,
    title: d.title,
    originAirport: d.homeAirport,
    homeCity: d.homeCity,
    lat: d.lat,
    lng: d.lng,
    rsvp: "INVITED",
    travelStatus: "NOT_STARTED",
    dietary: d.dietary,
    accessibility: d.accessibility,
    seatPreference: d.seatPreference,
    loyaltyNumbers: d.loyaltyNumbers,
    knownTravelerNumber: d.knownTravelerNumber,
    airlinePreference: d.airlinePreference,
  };
}

/** Shape the new-traveler form posts. Mirrors DirectoryTraveler minus the id. */
export interface NewTravelerInput {
  name: string;
  email: string;
  department: string;
  title: string;
  homeCity?: string;
  homeAirport: string;
  dietary?: string[];
  accessibility?: string[];
  seatPreference?: Attendee["seatPreference"];
  knownTravelerNumber?: string;
  airlinePreference?: string;
}

/** Builds an attendee from a hand-entered traveler (not yet in the directory). */
export function attendeeFromInput(input: NewTravelerInput): Attendee {
  const slug =
    input.email.split("@")[0]?.replace(/[^a-z0-9]/gi, "") ||
    input.name.toLowerCase().replace(/\s+/g, "-");
  return {
    id: `att-new-${slug}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    email: input.email,
    department: input.department || "Unassigned",
    title: input.title || "Traveler",
    originAirport: input.homeAirport.toUpperCase(),
    homeCity: input.homeCity,
    rsvp: "INVITED",
    travelStatus: "NOT_STARTED",
    dietary: input.dietary?.length ? input.dietary : undefined,
    accessibility: input.accessibility?.length ? input.accessibility : undefined,
    seatPreference: input.seatPreference,
    knownTravelerNumber: input.knownTravelerNumber || undefined,
    airlinePreference: input.airlinePreference || undefined,
  };
}
