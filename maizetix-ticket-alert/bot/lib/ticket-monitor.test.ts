import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAlertMessage,
  loadConfig,
  parseListings,
} from "./ticket-monitor.ts";

const fixtureUrl = new URL("../../fixtures/maizetix-game.html", import.meta.url);

test("parses and sorts MaizeTix ticket rows", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  const listings = parseListings(html);

  assert.equal(listings.length, 2);
  assert.deepEqual(
    listings.map(({ price, section, row, seat, url }) => ({
      price,
      section,
      row,
      seat,
      url,
    })),
    [
      {
        price: 44.5,
        section: "21",
        row: "10",
        seat: "8",
        url: "https://www.maizetix.com/tickets/test-ticket-1",
      },
      {
        price: 55,
        section: "33",
        row: "95",
        seat: "20",
        url: "https://www.maizetix.com/tickets/test-ticket-2",
      },
    ],
  );
  assert.notEqual(listings[0].fingerprint, listings[1].fingerprint);
});

test("loads the $45 default and rejects non-MaizeTix URLs", () => {
  const config = loadConfig({});
  assert.equal(config.maxPrice, 45);
  assert.equal(config.gameUrl, "https://www.maizetix.com/games/732");

  assert.throws(
    () =>
      loadConfig({
        MAIZETIX_GAME_URL: "https://example.com/games/732",
      }),
    /maizetix\.com/,
  );
});

test("builds a concise SMS with ticket details", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  const [listing] = parseListings(html);
  const message = buildAlertMessage(
    [listing],
    45,
    "https://www.maizetix.com/games/732",
  );

  assert.match(message, /\$45\.00 or less/);
  assert.match(message, /\$44\.50 — Section 21, Row 10, Seat 8/);
  assert.match(message, /maizetix\.com\/tickets\/test-ticket-1/);
});
