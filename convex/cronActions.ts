"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getDailyPeriodStart,
  getWeeklyPeriodStart,
  getMonthlyPeriodStart,
} from "./lib/periodUtils";

/**
 * Generate daily summaries for all active repositories
 * Runs at 00:05 UTC, generates summaries for yesterday
 */
export const generateDailySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Starting daily summary generation cron job");

    // Get all active repositories
    const repos = await ctx.runQuery(internal.repositories.listAllActive);
    console.log(`Found ${repos.length} active repositories`);

    // Calculate yesterday's time range (UTC)
    const now = Date.now();
    const yesterdayStart = getDailyPeriodStart(now - 24 * 60 * 60 * 1000);
    const yesterdayEnd = getDailyPeriodStart(now);

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const repo of repos) {
      try {
        // Check if summary already exists
        const existing = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
          repositoryId: repo._id,
          period: "daily",
          periodStart: yesterdayStart,
        });

        if (existing) {
          console.log(`Daily summary already exists for ${repo.fullName}, skipping`);
          skipped++;
          continue;
        }

        // Get digests for yesterday
        const digests = await ctx.runQuery(internal.digests.getByRepositoryTimeRange, {
          repositoryId: repo._id,
          startTime: yesterdayStart,
          endTime: yesterdayEnd,
        });

        if (digests.length === 0) {
          console.log(`No digests for ${repo.fullName} yesterday, skipping`);
          skipped++;
          continue;
        }

        console.log(`Generating daily summary for ${repo.fullName} with ${digests.length} digests`);

        // Generate summary using existing action
        await ctx.runAction(internal.summaries.generateSummaryOnDemand, {
          repositoryId: repo._id,
          period: "daily",
          periodStart: yesterdayStart,
        });

        generated++;
        console.log(`Generated daily summary for ${repo.fullName}`);
      } catch (error) {
        errors++;
        console.error(`Error generating daily summary for ${repo.fullName}:`, error);
      }
    }

    console.log(`Daily summary cron completed: ${generated} generated, ${skipped} skipped, ${errors} errors`);
    return { generated, skipped, errors };
  },
});

/**
 * Generate weekly summaries for all active repositories
 * Runs Monday 00:10 UTC, generates summaries for the previous week
 */
export const generateWeeklySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Starting weekly summary generation cron job");

    // Get all active repositories
    const repos = await ctx.runQuery(internal.repositories.listAllActive);
    console.log(`Found ${repos.length} active repositories`);

    // Calculate last week's time range (UTC)
    // getWeeklyPeriodStart returns Sunday 00:00 UTC
    const now = Date.now();
    const lastWeekStart = getWeeklyPeriodStart(now - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = getWeeklyPeriodStart(now);

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const repo of repos) {
      try {
        // Check if summary already exists
        const existing = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
          repositoryId: repo._id,
          period: "weekly",
          periodStart: lastWeekStart,
        });

        if (existing) {
          console.log(`Weekly summary already exists for ${repo.fullName}, skipping`);
          skipped++;
          continue;
        }

        // Get digests for last week
        const digests = await ctx.runQuery(internal.digests.getByRepositoryTimeRange, {
          repositoryId: repo._id,
          startTime: lastWeekStart,
          endTime: lastWeekEnd,
        });

        if (digests.length === 0) {
          console.log(`No digests for ${repo.fullName} last week, skipping`);
          skipped++;
          continue;
        }

        console.log(`Generating weekly summary for ${repo.fullName} with ${digests.length} digests`);

        // Generate summary using existing action
        await ctx.runAction(internal.summaries.generateSummaryOnDemand, {
          repositoryId: repo._id,
          period: "weekly",
          periodStart: lastWeekStart,
        });

        generated++;
        console.log(`Generated weekly summary for ${repo.fullName}`);
      } catch (error) {
        errors++;
        console.error(`Error generating weekly summary for ${repo.fullName}:`, error);
      }
    }

    console.log(`Weekly summary cron completed: ${generated} generated, ${skipped} skipped, ${errors} errors`);
    return { generated, skipped, errors };
  },
});

/**
 * Generate monthly summaries for all active repositories
 * Runs 1st of month 00:15 UTC, generates summaries for the previous month
 */
export const generateMonthlySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Starting monthly summary generation cron job");

    // Get all active repositories
    const repos = await ctx.runQuery(internal.repositories.listAllActive);
    console.log(`Found ${repos.length} active repositories`);

    // Calculate last month's time range (UTC)
    const now = Date.now();
    const thisMonthStart = getMonthlyPeriodStart(now);
    // Go back to previous month by subtracting a day from this month's start
    const lastMonthStart = getMonthlyPeriodStart(thisMonthStart - 24 * 60 * 60 * 1000);
    const lastMonthEnd = thisMonthStart;

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const repo of repos) {
      try {
        // Check if summary already exists
        const existing = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
          repositoryId: repo._id,
          period: "monthly",
          periodStart: lastMonthStart,
        });

        if (existing) {
          console.log(`Monthly summary already exists for ${repo.fullName}, skipping`);
          skipped++;
          continue;
        }

        // Get digests for last month
        const digests = await ctx.runQuery(internal.digests.getByRepositoryTimeRange, {
          repositoryId: repo._id,
          startTime: lastMonthStart,
          endTime: lastMonthEnd,
        });

        if (digests.length === 0) {
          console.log(`No digests for ${repo.fullName} last month, skipping`);
          skipped++;
          continue;
        }

        console.log(`Generating monthly summary for ${repo.fullName} with ${digests.length} digests`);

        // Generate summary using existing action
        await ctx.runAction(internal.summaries.generateSummaryOnDemand, {
          repositoryId: repo._id,
          period: "monthly",
          periodStart: lastMonthStart,
        });

        generated++;
        console.log(`Generated monthly summary for ${repo.fullName}`);
      } catch (error) {
        errors++;
        console.error(`Error generating monthly summary for ${repo.fullName}:`, error);
      }
    }

    console.log(`Monthly summary cron completed: ${generated} generated, ${skipped} skipped, ${errors} errors`);
    return { generated, skipped, errors };
  },
});
