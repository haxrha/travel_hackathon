import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  cron: "*/2 * * * *",
  async run({ callTool }) {
    await callTool("check-ticket-prices", {});
  },
});
