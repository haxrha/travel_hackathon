/**
 * Demo proposal — the SF Q3 onsite, as returned by the research agents.
 *
 * Kept verbatim in the agent's wire format (snake_case, nulls intact) so the
 * parser and the renderer are exercised against real output rather than a
 * cleaned-up version of it. Dates are rebased onto the current year at read
 * time so the demo never goes stale.
 */

import type { TripProposal } from "./proposal";

const RAW = {
  request_id: "TRQ-2026-0847",
  trip_purpose: "Team onsite - Q3 planning & bonding",
  destination_city: "San Francisco",
  destination_address: "525 Market St, San Francisco, CA 94105",
  start_date: "2026-10-12",
  end_date: "2026-10-16",
  summary:
    "Recommended schedule-based itinerary for all four travelers: Jonas Becker, Priya Sharma, and Lena Fischer travel BER–FRA–SFO on Lufthansa, while Tom Weiss travels MUC–FRA–SFO to arrive at SFO at approximately 12:40 local on October 12, before the requested 15:00 deadline. The proposed hotel is The Clancy, Autograph Collection, approximately 8–10 minutes on foot from the office, with four single rooms requested and an accessible king room requested for Tom. No exact-date live flight fares, hotel inventory, accessible-room availability, or ground-transport quotes were returned, so this is not yet bookable and the budget cannot be validated. Budget approval from Markus Weber remains pending; no booking has been made.",
  status: "awaiting_budget_approval",
  travel_map: [
    { traveler_name: "Jonas Becker", home_city: "Berlin", home_airport: "BER", latitude: 52.3666, longitude: 13.5033 },
    { traveler_name: "Priya Sharma", home_city: "Berlin", home_airport: "BER", latitude: 52.3666, longitude: 13.5033 },
    { traveler_name: "Tom Weiss", home_city: "Munich", home_airport: "MUC", latitude: 48.3538, longitude: 11.7861 },
    { traveler_name: "Lena Fischer", home_city: "Berlin", home_airport: "BER", latitude: 52.3666, longitude: 13.5033 },
  ],
  flights: [
    {
      traveler_name: "Jonas Becker",
      home_airport: "BER",
      destination_airport: "SFO",
      outbound_legs: [
        { flight_number: "LH171", airline: "Lufthansa", origin_airport: "BER", destination_airport: "FRA", departure_local_time: "2026-10-12 08:15", arrival_local_time: "2026-10-12 09:25" },
        { flight_number: "LH454", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "SFO", departure_local_time: "2026-10-12 10:25", arrival_local_time: "2026-10-12 12:40" },
      ],
      return_legs: [
        { flight_number: "LH455", airline: "Lufthansa", origin_airport: "SFO", destination_airport: "FRA", departure_local_time: "2026-10-16 14:40", arrival_local_time: "2026-10-17 10:25" },
        { flight_number: "LH186", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "BER", departure_local_time: "2026-10-17 12:45", arrival_local_time: "2026-10-17 13:55" },
      ],
      destination_arrival_local_time: "2026-10-12 12:40",
      origin_departure_local_time: "2026-10-16 14:40",
      airline_preference_honored: true,
      seat_preference: "aisle",
      special_requests: ["Add Miles & More LH4471203", "Request aisle seat", "Request vegetarian meal"],
      price: { amount_usd: null, status: "unavailable", notes: "No verified live quote for the exact October 12–16 itinerary." },
      risk_flags: [
        "Schedule pattern reported, but live bookable inventory and cabin were not confirmed.",
        "One-hour BER–FRA connection; connection feasibility must be confirmed in the live booking.",
      ],
    },
    {
      traveler_name: "Priya Sharma",
      home_airport: "BER",
      destination_airport: "SFO",
      outbound_legs: [
        { flight_number: "LH171", airline: "Lufthansa", origin_airport: "BER", destination_airport: "FRA", departure_local_time: "2026-10-12 08:15", arrival_local_time: "2026-10-12 09:25" },
        { flight_number: "LH454", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "SFO", departure_local_time: "2026-10-12 10:25", arrival_local_time: "2026-10-12 12:40" },
      ],
      return_legs: [
        { flight_number: "LH455", airline: "Lufthansa", origin_airport: "SFO", destination_airport: "FRA", departure_local_time: "2026-10-16 14:40", arrival_local_time: "2026-10-17 10:25" },
        { flight_number: "LH186", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "BER", departure_local_time: "2026-10-17 12:45", arrival_local_time: "2026-10-17 13:55" },
      ],
      destination_arrival_local_time: "2026-10-12 12:40",
      origin_departure_local_time: "2026-10-16 14:40",
      airline_preference_honored: null,
      seat_preference: "window",
      special_requests: ["Add KTN-98213765", "Request window seat"],
      price: { amount_usd: null, status: "unavailable", notes: "No verified live quote for the exact October 12–16 itinerary." },
      risk_flags: [
        "Schedule pattern reported, but live bookable inventory, cabin, and seat availability were not confirmed.",
        "One-hour BER–FRA connection; connection feasibility must be confirmed in the live booking.",
      ],
    },
    {
      traveler_name: "Tom Weiss",
      home_airport: "MUC",
      destination_airport: "SFO",
      outbound_legs: [
        { flight_number: "LH125", airline: "Lufthansa", origin_airport: "MUC", destination_airport: "FRA", departure_local_time: "2026-10-12 07:00", arrival_local_time: "2026-10-12 08:00" },
        { flight_number: "LH454", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "SFO", departure_local_time: "2026-10-12 10:25", arrival_local_time: "2026-10-12 12:40" },
      ],
      return_legs: [
        { flight_number: "LH459", airline: "Lufthansa", origin_airport: "SFO", destination_airport: "MUC", departure_local_time: "2026-10-16 21:05", arrival_local_time: "2026-10-17 17:10" },
      ],
      destination_arrival_local_time: "2026-10-12 12:40",
      origin_departure_local_time: "2026-10-16 21:05",
      airline_preference_honored: null,
      seat_preference: null,
      special_requests: ["Request wheelchair-accessible hotel room"],
      price: { amount_usd: null, status: "unavailable", notes: "No verified live quote for the exact October 12–16 itinerary." },
      risk_flags: [
        "Schedule pattern reported, but live bookable inventory and cabin were not confirmed.",
        "Accessible airport/airline assistance was not specified; confirm any required assistance before booking.",
      ],
    },
    {
      traveler_name: "Lena Fischer",
      home_airport: "BER",
      destination_airport: "SFO",
      outbound_legs: [
        { flight_number: "LH171", airline: "Lufthansa", origin_airport: "BER", destination_airport: "FRA", departure_local_time: "2026-10-12 08:15", arrival_local_time: "2026-10-12 09:25" },
        { flight_number: "LH454", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "SFO", departure_local_time: "2026-10-12 10:25", arrival_local_time: "2026-10-12 12:40" },
      ],
      return_legs: [
        { flight_number: "LH455", airline: "Lufthansa", origin_airport: "SFO", destination_airport: "FRA", departure_local_time: "2026-10-16 14:40", arrival_local_time: "2026-10-17 10:25" },
        { flight_number: "LH186", airline: "Lufthansa", origin_airport: "FRA", destination_airport: "BER", departure_local_time: "2026-10-17 12:45", arrival_local_time: "2026-10-17 13:55" },
      ],
      destination_arrival_local_time: "2026-10-12 12:40",
      origin_departure_local_time: "2026-10-16 14:40",
      airline_preference_honored: true,
      seat_preference: "aisle",
      special_requests: [
        "Add Miles & More LH1029384",
        "Add Marriott Bonvoy MB55291002",
        "Request aisle seat",
        "Note lactose intolerance for meal planning",
      ],
      price: { amount_usd: null, status: "unavailable", notes: "No verified live quote for the exact October 12–16 itinerary." },
      risk_flags: [
        "Schedule pattern reported, but live bookable inventory and cabin were not confirmed.",
        "One-hour BER–FRA connection; connection feasibility must be confirmed in the live booking.",
      ],
    },
  ],
  hotel: {
    hotel_name: "The Clancy, Autograph Collection",
    address: "299 Second Street, San Francisco, CA 94105",
    star_rating: 4.0,
    walking_distance_to_office:
      "Approximately 0.4 miles; 8–10 minutes on foot to 525 Market St.",
    check_in: "2026-10-12",
    check_out: "2026-10-16",
    rooms: [
      { traveler_name: "Jonas Becker", room_type: "Single occupancy, standard king or equivalent", accessible: false, accessibility_notes: null, price: { amount_usd: null, status: "unavailable", notes: "No live exact-date quote or inventory returned." } },
      { traveler_name: "Priya Sharma", room_type: "Single occupancy, standard king or equivalent", accessible: false, accessibility_notes: null, price: { amount_usd: null, status: "unavailable", notes: "No live exact-date quote or inventory returned." } },
      { traveler_name: "Tom Weiss", room_type: "Wheelchair-accessible king room; bathroom configuration must be confirmed", accessible: true, accessibility_notes: "An accessible king room type is reported, but availability for October 12–16, 2026 and exact bathroom configuration are unconfirmed.", price: { amount_usd: null, status: "unavailable", notes: "No live exact-date quote or inventory returned." } },
      { traveler_name: "Lena Fischer", room_type: "Single occupancy, standard king or equivalent", accessible: false, accessibility_notes: null, price: { amount_usd: null, status: "unavailable", notes: "No live exact-date quote or inventory returned." } },
    ],
    total_price: { amount_usd: null, status: "unavailable", notes: "Exact-date simultaneous inventory, taxes, fees, and cancellation/payment terms were not returned." },
    alternatives_considered: [
      "Hyatt Regency San Francisco Downtown SOMA — approximately 6–8 minutes from the office; accessible room features documented, but exact-date inventory and pricing unavailable.",
      "Palace Hotel, a Luxury Collection Hotel — approximately 6–8 minutes from the office; accessible room types documented, but likely higher tier and exact-date pricing/inventory unavailable.",
      "Four Seasons Hotel San Francisco at Embarcadero — approximately 10–12 minutes from the office; multiple accessible room types documented, but exact-date pricing/inventory unavailable.",
    ],
  },
  ground_transportation: [
    {
      description: "Airport transfer/rideshare between SFO and hotel for the group",
      traveler_names: ["Jonas Becker", "Priya Sharma", "Tom Weiss", "Lena Fischer"],
      price: { amount_usd: null, status: "unavailable", notes: "No live quote obtained; rental car is not required." },
    },
  ],
  budget: {
    total_budget_usd: 18000.0,
    per_person_limit_usd: 4500.0,
    currency: "USD",
    breakdown: [
      { category: "flights", price: { amount_usd: null, status: "unavailable", notes: "No exact-date live fares returned for the four travelers." } },
      { category: "hotel", price: { amount_usd: null, status: "unavailable", notes: "No exact-date quote or simultaneous four-room inventory returned." } },
      { category: "ground_transportation", price: { amount_usd: null, status: "unavailable", notes: "No live airport-transfer/rideshare quote returned." } },
    ],
    estimated_total_cost: { amount_usd: null, status: "unavailable", notes: "Cannot calculate a truthful total until live flight, hotel, and ground quotes are obtained." },
    per_traveler_cost_usd: {},
    over_budget: null,
    approval_status: "pending",
    approver: "Markus Weber",
  },
  flags: [
    { severity: "critical", message: "No booking may be made yet: budget approval from Markus Weber is pending." },
    { severity: "critical", message: "The research agents did not return exact-date live prices or bookable availability for flights, hotel rooms, Tom's accessible room, or ground transportation; total cost and budget compliance are therefore unavailable." },
    { severity: "warning", message: "The proposed Lufthansa schedules place all four travelers at SFO around 12:40 on October 12, meeting the requested 15:00 arrival target, but the schedules are not live inventory confirmations." },
    { severity: "warning", message: "Jonas, Priya, and Lena have a one-hour BER–FRA connection; confirm the protected connection and minimum connection requirements before booking." },
    { severity: "warning", message: "Tom's accessible hotel room type was identified, but exact availability and bathroom configuration were not confirmed." },
    { severity: "info", message: "Dietary needs are recorded for planning: vegetarian for Jonas and lactose intolerance for Lena. They require airline meal/meal-service confirmation rather than being silently assumed." },
    { severity: "info", message: "The proposed hotel is walkable to the office, supporting the 9:00–18:00 office schedule; no rental car is needed." },
  ],
  next_steps: [
    "Organizer should provide one explicit go/no-go decision on the complete itinerary and authorize live quote verification; approval is currently pending with Markus Weber.",
    "Before any booking, obtain exact-date live fares and inventory for the four proposed flight itineraries, including cabin, seat-map, loyalty-number attachment, and meal-request feasibility.",
    "Confirm four simultaneous single rooms at The Clancy, including Tom Weiss's wheelchair-accessible room and bathroom configuration, plus taxes, fees, cancellation, and payment terms.",
    "Obtain and add live SFO airport-transfer/rideshare pricing.",
    "After explicit approval of the fully priced plan, pass the exact selected flights, traveler names, loyalty numbers, KTN, meal/accessibility requests, and room assignments to the booking agent.",
  ],
};

export const SF_PROPOSAL_RAW: unknown = RAW;
export const SF_PROPOSAL = RAW as unknown as TripProposal;
