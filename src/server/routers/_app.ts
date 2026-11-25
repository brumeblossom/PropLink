import { router } from "../trpc";
import { authRouter } from "./auth";
import { propertiesRouter } from "./properties";
import { unitsRouter } from "./units";
import { leasesRouter } from "./leases";
import { paymentsRouter } from "./payments";
import { noticesRouter } from "./notices";
import { conversationsRouter } from "./conversations";
import { notificationsRouter } from "./notifications";
import { internalRouter } from "./internal";
import { dashboardRouter } from "./dashboard";
import { documentsRouter } from "./documents";
import { remindersRouter } from "./reminders";

export const appRouter = router({
  auth: authRouter,
  dashboard: dashboardRouter,
  properties: propertiesRouter,
  units: unitsRouter,
  leases: leasesRouter,
  payments: paymentsRouter,
  notices: noticesRouter,
  conversations: conversationsRouter,
  notifications: notificationsRouter,
  internal: internalRouter,
  documents: documentsRouter,
  reminders: remindersRouter,
});

export type AppRouter = typeof appRouter;
