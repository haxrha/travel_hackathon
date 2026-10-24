# MaizeTix SMS Alert Agent

Checks [Michigan vs Indiana tickets](https://www.maizetix.com/games/732)
every two minutes and sends a Twilio SMS when a newly observed listing costs
$45 or less. A durable listing fingerprint prevents repeat alerts for the
same ticket at the same price.

## Configure

1. Copy `.env.example` to `.env`.
2. Set the Twilio account SID and auth token.
3. Set `TWILIO_FROM_NUMBER` to a Twilio SMS-capable number.
4. Set `ALERT_TO_NUMBER` to the destination number. Use E.164 format
   (`+15551234567`) for both phone numbers.

Twilio trial accounts can text only verified destination numbers. Keep
`SMS_DRY_RUN=false` and `MAIZETIX_USE_FIXTURE=false` in production.

## Verify locally

```bash
npm test
npm run check
npx --yes "@grok/agent-sdk@0.2.29" validate --dir .
npx --yes "@grok/agent-sdk@0.2.29" info --dir . --json

# Deterministic check with the frozen fixture; never sends SMS.
MAIZETIX_USE_FIXTURE=true SMS_DRY_RUN=true \
  npx --yes "@grok/agent-sdk@0.2.29" tool call check-ticket-prices \
  --dir . --input '{}' --json
```

Run `npm run dev` to use the playground. Development mode does not fire
schedules automatically; dispatch `check-prices` from the playground when
testing. A production server or Cursor-managed deployment runs the
`*/2 * * * *` UTC schedule automatically.

## Behavior

- The threshold comparison is inclusive: a `$45.00` ticket qualifies.
- One SMS summarizes all newly qualifying listings found in a check.
- A ticket can alert again if its price changes and remains at or below the
  threshold.
- Failed Twilio sends are not marked as notified, so a later check can retry.
- Credentials are read only from environment variables and are never included
  in tool output.
