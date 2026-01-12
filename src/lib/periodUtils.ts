/**
 * Period calculation utilities for summary reports
 * All calculations use UTC to avoid timezone confusion
 */

export type PeriodType = "daily" | "weekly" | "monthly";

/**
 * Get the start of the day in UTC (00:00:00 UTC)
 */
export function getDailyPeriodStart(timestamp: number): number {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return Date.UTC(year, month, day);
}

/**
 * Get the start of the week in UTC (Sunday 00:00:00 UTC)
 */
export function getWeeklyPeriodStart(timestamp: number): number {
  const date = new Date(timestamp);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Calculate days to subtract to get to Sunday
  const daysToSubtract = dayOfWeek;
  const sundayDate = new Date(Date.UTC(year, month, day - daysToSubtract));
  
  return Date.UTC(
    sundayDate.getUTCFullYear(),
    sundayDate.getUTCMonth(),
    sundayDate.getUTCDate()
  );
}

/**
 * Get the start of the month in UTC (1st of month, 00:00:00 UTC)
 */
export function getMonthlyPeriodStart(timestamp: number): number {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return Date.UTC(year, month, 1);
}

/**
 * Get the period start for a given timestamp and period type
 */
export function getPeriodForTimestamp(
  timestamp: number,
  period: PeriodType
): number {
  switch (period) {
    case "daily":
      return getDailyPeriodStart(timestamp);
    case "weekly":
      return getWeeklyPeriodStart(timestamp);
    case "monthly":
      return getMonthlyPeriodStart(timestamp);
  }
}

/**
 * Get the period end for a given period start and period type
 */
export function getPeriodEnd(periodStart: number, period: PeriodType): number {
  switch (period) {
    case "daily": {
      // Next day
      const date = new Date(periodStart);
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1
      );
    }
    case "weekly": {
      // Next Sunday (7 days later)
      const date = new Date(periodStart);
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 7
      );
    }
    case "monthly": {
      // Next month
      const date = new Date(periodStart);
      const nextMonth = date.getUTCMonth() + 1;
      return Date.UTC(date.getUTCFullYear(), nextMonth, 1);
    }
  }
}

/**
 * Format period start timestamp as a date range string
 */
export function formatPeriodRange(periodStart: number, period: PeriodType): string {
  const startDate = new Date(periodStart);
  const endDate = new Date(getPeriodEnd(periodStart, period));
  
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  
  switch (period) {
    case "daily": {
      return startDate.toLocaleDateString("en-US", {
        ...formatOptions,
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    case "weekly": {
      const endDay = endDate.getUTCDate() - 1; // Subtract 1 to get the last day of the week
      const endDateAdjusted = new Date(endDate);
      endDateAdjusted.setUTCDate(endDay);
      
      if (startDate.getUTCMonth() === endDateAdjusted.getUTCMonth()) {
        return `${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}-${endDateAdjusted.toLocaleDateString("en-US", { day: "numeric", year: "numeric", timeZone: "UTC" })}`;
      } else {
        return `${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}-${endDateAdjusted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
      }
    }
    case "monthly": {
      return startDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
}