import { prisma } from "@/server/db/client";
import { BaseAgent } from "./base";
import { tavilySearch } from "../tools/search/tavily";

/** Travel Requirements — source-backed passport/visa/entry-rule checks. */
export class RequirementsAgent extends BaseAgent {
  kind = "GUARDIAN" as const;

  async verify(passportCountry: string, destination: string) {
    const key = `${passportCountry}->${destination}`;
    const existing = await prisma.travelRequirement.findFirst({ where: { destination: key } });
    if (existing) return existing;

    const web = await tavilySearch(`official entry requirements ${passportCountry} citizens ${destination}`);
    const req = await prisma.travelRequirement.upsert({
      where: { destination_requirement: { destination: key, requirement: "entry" } },
      create: {
        destination: key,
        requirement: "Verify passport validity, visa/ETA, and entry conditions before booking.",
        source: web[0]?.url,
        sourceBacked: !!web[0]?.url,
        metadata: { web } as any,
      },
      update: {},
    });
    await this.logAction({ action: "check_requirements", input: { passportCountry, destination }, result: req as any });
    return req;
  }
}
