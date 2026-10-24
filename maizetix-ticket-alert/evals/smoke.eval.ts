import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "The agent uses the ticket checker for a price check.",
  async test(t) {
    await t.send("Check the MaizeTix ticket prices now.");
    t.succeeded();
    t.calledTool("check-ticket-prices", {
      status: "completed",
      count: 1,
    });
  },
});
