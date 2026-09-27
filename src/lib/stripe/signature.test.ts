import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyStripeSignature } from "./signature.ts";

test("accepts a current Stripe signature", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret), true);
});

test("rejects a forged signature and a stale timestamp", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature("{}", `t=${timestamp},v1=${"ab".repeat(32)}`, "whsec_test"), false);
  const old = timestamp - 3_600;
  const signature = createHmac("sha256", "whsec_test").update(`${old}.{}`).digest("hex");
  assert.equal(verifyStripeSignature("{}", `t=${old},v1=${signature}`, "whsec_test"), false);
});
