import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Generate daily summaries at 00:05 UTC
// This creates summaries for yesterday's activity
crons.daily(
  "generate daily summaries",
  { hourUTC: 0, minuteUTC: 5 },
  internal.cronActions.generateDailySummaries
);

// Generate weekly summaries every Monday at 00:10 UTC
// This creates summaries for the previous week (Sun-Sat)
crons.weekly(
  "generate weekly summaries",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 10 },
  internal.cronActions.generateWeeklySummaries
);

// Generate monthly summaries on the 1st of each month at 00:15 UTC
// This creates summaries for the previous month
crons.monthly(
  "generate monthly summaries",
  { day: 1, hourUTC: 0, minuteUTC: 15 },
  internal.cronActions.generateMonthlySummaries
);

// Retry failed events every 15 minutes
crons.interval(
  "retry failed events",
  { minutes: 15 },
  internal.cronActions.retryFailedEvents
);

export default crons;
