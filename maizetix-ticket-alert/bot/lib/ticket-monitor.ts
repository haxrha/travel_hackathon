import { createHash } from "node:crypto";

const DEFAULT_GAME_URL = "https://www.maizetix.com/games/732";
const DEFAULT_MAX_PRICE = 45;
const MAX_MESSAGE_LISTINGS = 5;

export type TicketListing = {
  price: number;
  section: string;
  row: string;
  seat: string;
  url: string;
  fingerprint: string;
};

export type MonitorConfig = {
  gameUrl: string;
  maxPrice: number;
  twilioAccountSid: string | undefined;
  twilioAuthToken: string | undefined;
  twilioFromNumber: string | undefined;
  alertToNumber: string | undefined;
  smsDryRun: boolean;
  useFixture: boolean;
};

function text(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(url: string, price: number): string {
  return createHash("sha256").update(`${url}|${price.toFixed(2)}`).digest("hex");
}

export function parseListings(html: string): TicketListing[] {
  const listings: TicketListing[] = [];
  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const priceMatch = rowHtml.match(/<td\b[^>]*>\s*\$([\d,]+(?:\.\d{2})?)\s*<\/td>/i);
    const detailsMatch = text(rowHtml).match(
      /Sect\.\s*([^|]+?)\s*\|\s*Row\s*([^|]+?)\s*\|\s*Seat\s*([A-Za-z0-9-]+)/i,
    );
    const linkMatch = rowHtml.match(
      /copyLinkAndNotify\(\s*['"]((?:https?:\/\/)?(?:www\.)?maizetix\.com\/tickets\/[^'"]+)['"]\s*\)/i,
    );

    if (!priceMatch || !detailsMatch || !linkMatch) {
      continue;
    }

    const price = Number(priceMatch[1].replaceAll(",", ""));
    if (!Number.isFinite(price)) {
      continue;
    }

    const url = linkMatch[1].startsWith("http")
      ? linkMatch[1]
      : `https://${linkMatch[1]}`;

    listings.push({
      price,
      section: detailsMatch[1].trim(),
      row: detailsMatch[2].trim(),
      seat: detailsMatch[3].trim(),
      url,
      fingerprint: fingerprint(url, price),
    });
  }

  return listings.sort((a, b) => a.price - b.price);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MonitorConfig {
  const maxPrice = Number(env.MAX_TICKET_PRICE ?? DEFAULT_MAX_PRICE);
  if (!Number.isFinite(maxPrice) || maxPrice < 0) {
    throw new Error("MAX_TICKET_PRICE must be a non-negative number.");
  }

  const gameUrl = env.MAIZETIX_GAME_URL ?? DEFAULT_GAME_URL;
  const parsedUrl = new URL(gameUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    !["maizetix.com", "www.maizetix.com"].includes(parsedUrl.hostname)
  ) {
    throw new Error("MAIZETIX_GAME_URL must be an HTTPS URL on maizetix.com.");
  }

  return {
    gameUrl,
    maxPrice,
    twilioAccountSid: env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: env.TWILIO_AUTH_TOKEN,
    twilioFromNumber: env.TWILIO_FROM_NUMBER,
    alertToNumber: env.ALERT_TO_NUMBER,
    smsDryRun: env.SMS_DRY_RUN === "true",
    useFixture: env.MAIZETIX_USE_FIXTURE === "true",
  };
}

export function buildAlertMessage(
  listings: TicketListing[],
  maxPrice: number,
  gameUrl: string,
): string {
  const shown = listings.slice(0, MAX_MESSAGE_LISTINGS);
  const lines = shown.map(
    ({ price, section, row, seat, url }) =>
      `$${price.toFixed(2)} — Section ${section}, Row ${row}, Seat ${seat}: ${url}`,
  );
  const remainder =
    listings.length > shown.length
      ? `\n+${listings.length - shown.length} more qualifying listing(s): ${gameUrl}`
      : "";

  return `MaizeTix: ${listings.length} new ticket(s) at $${maxPrice.toFixed(2)} or less.\n${lines.join("\n")}${remainder}`;
}

export async function fetchGamePage(gameUrl: string): Promise<string> {
  const response = await fetch(gameUrl, {
    headers: {
      accept: "text/html",
      "user-agent": "MaizeTixPriceAlert/1.0 (+personal ticket monitor)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`MaizeTix returned HTTP ${response.status}.`);
  }

  return response.text();
}

export async function sendTwilioSms(
  config: MonitorConfig,
  body: string,
): Promise<{ sent: boolean; messageSid?: string }> {
  if (config.smsDryRun) {
    return { sent: false };
  }

  const {
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
    alertToNumber,
  } = config;

  if (
    !twilioAccountSid ||
    !twilioAuthToken ||
    !twilioFromNumber ||
    !alertToNumber
  ) {
    throw new Error(
      "Twilio configuration is incomplete. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and ALERT_TO_NUMBER.",
    );
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: alertToNumber,
      From: twilioFromNumber,
      Body: body,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Twilio returned HTTP ${response.status}.`);
  }

  const result = (await response.json()) as { sid?: unknown };
  return {
    sent: true,
    messageSid: typeof result.sid === "string" ? result.sid : undefined,
  };
}

export const SMOKE_FIXTURE_HTML = `
<table>
  <tr>
    <td><div class="nav-pfp">AB</div></td>
    <td>$44.50</td>
    <td><p>Sect. 21 | Row 10 | Seat 8</p></td>
    <td><button>Buy</button></td>
    <td><button onclick="copyLinkAndNotify('www.maizetix.com/tickets/test-ticket-1')">Copy link</button></td>
  </tr>
  <tr>
    <td><div class="nav-pfp">CD</div></td>
    <td>$55.00</td>
    <td><p>Sect. 33 | Row 95 | Seat 20</p></td>
    <td><button>Buy</button></td>
    <td><button onclick="copyLinkAndNotify('www.maizetix.com/tickets/test-ticket-2')">Copy link</button></td>
  </tr>
</table>
`;
