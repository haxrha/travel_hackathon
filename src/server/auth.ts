import { isDemoMode } from "@/lib/demo";
import { prisma } from "./db/client";

/** Demo user id used when Clerk / DB are not configured. */
export const DEMO_USER_ID = "demo-user";

export async function requireUserId(): Promise<string> {
  if (isDemoMode()) return DEMO_USER_ID;

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const cu = await (await import("@clerk/nextjs/server")).currentUser();
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email: cu?.emailAddresses?.[0]?.emailAddress ?? `${userId}@wayport.local`,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || undefined,
          imageUrl: cu?.imageUrl,
          profile: {
            create: {
              dna: {
                personality: { adventure: 7, luxury: 5, spontaneity: 6, planning: 4 },
                physical: { walkingTolerance: 6, heatTolerance: 5, jetLagSeverity: 5 },
                social: { nightlife: 5, crowds: 4, touristAttractions: 4 },
                food: { dietary: [], spice: 5, fineDining: 5, streetFood: 6 },
                money: { budgetSensitivity: 6, hotelPriority: 5, experiencePriority: 7 },
                style: { slowTravel: false, localExperiences: true, photography: false, architecture: false },
              },
            },
          },
        },
      });
    }
    return user.id;
  } catch {
    // DB not reachable — still allow demo-ish browsing when signed in.
    return userId;
  }
}
