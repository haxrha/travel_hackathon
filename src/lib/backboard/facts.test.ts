import assert from "node:assert/strict";
import test from "node:test";
import { applyMemoryToPlanItems, extractTravelerFacts, mergeFacts } from "./facts.ts";

test("extracts the preferences a traveler mentions offhand", () => {
  const facts = extractTravelerFacts(
    "5 days in Kyoto. I prefer aisle seats, I'm vegetarian, I avoid red-eyes, and my hotel ceiling is $150/night.",
  );
  const contents = facts.map((f) => f.content).sort();
  assert.deepEqual(contents, [
    "Avoids red-eye flights.",
    "Hard hotel budget ceiling $150/night.",
    "Prefers aisle seats.",
    "Vegetarian.",
  ]);
  assert.equal(facts.find((f) => f.nightlyUsd)?.nightlyUsd, 150);
});

test("a second trip recalls the first trip's facts and applies them", () => {
  const first = extractTravelerFacts(
    "I prefer aisle seats, I'm vegetarian, I avoid red-eyes, and my hard budget ceiling is ~$150/night.",
  );
  const secondText = "Plan 4 days in Lisbon — use what you already know about me.";
  const learned = extractTravelerFacts(secondText).filter((fact) => !first.some((prev) => prev.id === fact.id));
  const applied = mergeFacts(first, extractTravelerFacts(secondText));
  assert.equal(learned.length, 0);
  assert.equal(applied.length, first.length);

  const items = applyMemoryToPlanItems(
    [
      { kind: "FLIGHT", title: "Red-eye to Lisbon", startHour: 23, priceUsd: 640 },
      { kind: "HOTEL", title: "Check in — Baixa hotel", priceUsd: 240 },
      { kind: "RESTAURANT", title: "Dinner in Baixa", priceUsd: 48 },
    ],
    applied,
  );

  assert.equal(items[0]?.startHour, 10);
  assert.match(items[0]?.notes ?? "", /aisle/i);
  assert.match(items[0]?.notes ?? "", /red-eye/i);
  assert.equal(items[1]?.priceUsd, 150);
  assert.match(items[1]?.notes ?? "", /\$150/);
  assert.match(items[2]?.title ?? "", /^Vegetarian/);
});
