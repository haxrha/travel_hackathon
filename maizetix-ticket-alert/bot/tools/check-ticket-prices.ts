import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  buildAlertMessage,
  fetchGamePage,
  loadConfig,
  parseListings,
  sendTwilioSms,
  SMOKE_FIXTURE_HTML,
} from "../lib/ticket-monitor.js";

const NOTIFIED_KEY = "maizetix:notified-listings:v1";

function notifiedFingerprints(value: unknown): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("fingerprints" in value) ||
    !Array.isArray(value.fingerprints)
  ) {
    return [];
  }

  return value.fingerprints.filter(
    (fingerprint): fingerprint is string => typeof fingerprint === "string",
  );
}

export default defineTool({
  description:
    "Check the configured MaizeTix game for tickets at or below the configured price, and send one deduplicated SMS alert when new matches appear.",
  inputSchema: z.object({}),
  effect: "idempotent",
  dryRunResult: () => ({
    checked: false,
    qualifyingCount: 0,
    newCount: 0,
    smsSent: false,
    reason: "Agent SDK dry run; no network request or SMS was sent.",
  }),
  async execute(_input, ctx) {
    const config = loadConfig();
    const fixtureMode =
      ctx.session.purpose === "eval" || config.useFixture;
    const effectiveConfig = fixtureMode
      ? { ...config, smsDryRun: true }
      : config;
    const html = fixtureMode
      ? SMOKE_FIXTURE_HTML
      : await fetchGamePage(config.gameUrl);
    const listings = parseListings(html);

    if (listings.length === 0) {
      throw new Error(
        "No ticket listings could be parsed from the MaizeTix response.",
      );
    }

    const qualifying = listings.filter(
      ({ price }) => price <= config.maxPrice,
    );
    const previous = notifiedFingerprints(await ctx.host.kv.get(NOTIFIED_KEY));
    const previousSet = new Set(previous);
    const newListings = qualifying.filter(
      ({ fingerprint }) => !previousSet.has(fingerprint),
    );

    if (newListings.length === 0) {
      return {
        checked: true,
        listingCount: listings.length,
        qualifyingCount: qualifying.length,
        newCount: 0,
        smsSent: false,
        lowestPrice: listings[0]?.price,
        reason: "No new qualifying listings.",
      };
    }

    const message = buildAlertMessage(
      newListings,
      config.maxPrice,
      config.gameUrl,
    );
    const sms = await sendTwilioSms(effectiveConfig, message);

    if (sms.sent) {
      const updated = [
        ...new Set([
          ...previous,
          ...newListings.map(({ fingerprint }) => fingerprint),
        ]),
      ].slice(-1_000);
      await ctx.host.kv.put(NOTIFIED_KEY, {
        fingerprints: updated,
        updatedAt: new Date().toISOString(),
      });
    }

    return {
      checked: true,
      listingCount: listings.length,
      qualifyingCount: qualifying.length,
      newCount: newListings.length,
      smsSent: sms.sent,
      messageSid: sms.messageSid,
      lowestPrice: listings[0]?.price,
      reason: sms.sent
        ? "Sent an SMS for new qualifying listings."
        : "Fixture or SMS dry-run mode; no SMS was sent.",
    };
  },
});
