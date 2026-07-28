import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { authRouter } from "./auth";
import { propertiesRouter } from "./properties";
import { unitsRouter } from "./units";
import { leasesRouter } from "./leases";
import { paymentsRouter } from "./payments";
import { noticesRouter } from "./notices";
import { conversationsRouter } from "./conversations";
import { notificationsRouter } from "./notifications";

export const appRouter = router({
  auth: authRouter,
  properties: propertiesRouter,
  units: unitsRouter,
  leases: leasesRouter,
  payments: paymentsRouter,
  notices: noticesRouter,
  conversations: conversationsRouter,
  notifications: notificationsRouter,
  hello: publicProcedure
    .input(
      z.object({
        text: z.string(),
      })
    )
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
