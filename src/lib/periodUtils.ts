/**
 * Period calculation utilities for summary reports
 * All calculations use user's local timezone
 */

export type PeriodType = "daily" | "weekly" | "monthly";

/**
 * Get the user's timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get timestamp for midnight in a specific timezone for a given date
 */
function getMidnightInTimezone(year: number, month: number, day: number, timezone: string): number {
  // Create a date string for the date we want
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  
  // Use Intl to format a test UTC time and see what it shows in the timezone
  // We'll find the UTC time where the timezone shows midnight
  let candidate = Date.UTC(year, month, day, 12, 0, 0); // Start with noon UTC
  
  // Binary search for the UTC timestamp where timezone shows midnight
  let low = Date.UTC(year, month, day, 0, 0, 0) - 24 * 60 * 60 * 1000; // 24 hours before
  let high = Date.UTC(year, month, day, 0, 0, 0) + 24 * 60 * 60 * 1000; // 24 hours after
  
  for (let i = 0; i < 20; i++) {
    candidate = Math.floor((low + high) / 2);
    const testDate = new Date(candidate);
    
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(testDate);
    
    const tzYear = parseInt(parts.find(p => p.type === "year")!.value);
    const tzMonth = parseInt(parts.find(p => p.type === "month")!.value) - 1;
    const tzDay = parseInt(parts.find(p => p.type === "day")!.value);
    const tzHour = parseInt(parts.find(p => p.type === "hour")!.value);
    const tzMinute = parseInt(parts.find(p => p.type === "minute")!.value);
    
    if (tzYear === year && tzMonth === month && tzDay === day && tzHour === 0 && tzMinute === 0) {
      return candidate;
    }
    
    if (tzYear < year || (tzYear === year && tzMonth < month) || 
        (tzYear === year && tzMonth === month && tzDay < day) ||
        (tzYear === year && tzMonth === month && tzDay === day && tzHour < 0)) {
      low = candidate;
    } else {
      high = candidate;
    }
  }
  
  return candidate;
}

/**
 * Get the start of the day in the user's timezone (00:00:00 local time)
 */
export function getDailyPeriodStart(timestamp: number, timezone?: string): number {
  const tz = timezone || getUserTimezone();
  const date = new Date(timestamp);
  
  // Format the date in the user's timezone to get year, month, day
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1; // 0-indexed
  const day = parseInt(parts.find(p => p.type === "day")!.value);
  
  return getMidnightInTimezone(year, month, day, tz);
}

/**
 * Get the start of the week in the user's timezone (Sunday 00:00:00 local time)
 */
export function getWeeklyPeriodStart(timestamp: number, timezone?: string): number {
  const tz = timezone || getUserTimezone();
  const date = new Date(timestamp);
  
  // Get the date components in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find(p => p.type === "day")!.value);
  const weekday = parts.find(p => p.type === "weekday")!.value;
  
  // Calculate days to subtract to get to Sunday
  const dayMap: Record<string, number> = {
    "Sunday": 0,
    "Monday": 1,
    "Tuesday": 2,
    "Wednesday": 3,
    "Thursday": 4,
    "Friday": 5,
    "Saturday": 6,
  };
  
  const daysToSubtract = dayMap[weekday] || 0;
  
  // Calculate Sunday's date (handling month/year boundaries)
  let sundayDay = day - daysToSubtract;
  let sundayMonth = month;
  let sundayYear = year;
  
  if (sundayDay < 1) {
    sundayMonth--;
    if (sundayMonth < 0) {
      sundayMonth = 11;
      sundayYear--;
    }
    // Get days in previous month
    const daysInPrevMonth = new Date(sundayYear, sundayMonth + 1, 0).getDate();
    sundayDay = daysInPrevMonth + sundayDay;
  }
  
  return getMidnightInTimezone(sundayYear, sundayMonth, sundayDay, tz);
}

/**
 * Get the start of the month in the user's timezone (1st of month, 00:00:00 local time)
 */
export function getMonthlyPeriodStart(timestamp: number, timezone?: string): number {
  const tz = timezone || getUserTimezone();
  const date = new Date(timestamp);
  
  // Get the date components in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  
  return getMidnightInTimezone(year, month, 1, tz);
}

/**
 * Get the period start for a given timestamp and period type
 */
export function getPeriodForTimestamp(
  timestamp: number,
  period: PeriodType,
  timezone?: string
): number {
  switch (period) {
    case "daily":
      return getDailyPeriodStart(timestamp, timezone);
    case "weekly":
      return getWeeklyPeriodStart(timestamp, timezone);
    case "monthly":
      return getMonthlyPeriodStart(timestamp, timezone);
  }
}

/**
 * Get the period end for a given period start and period type
 */
export function getPeriodEnd(periodStart: number, period: PeriodType, timezone?: string): number {
  const tz = timezone || getUserTimezone();
  const date = new Date(periodStart);
  
  // Get the date in the timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  const parts = formatter.formatToParts(date);
  let year = parseInt(parts.find(p => p.type === "year")!.value);
  let month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  let day = parseInt(parts.find(p => p.type === "day")!.value);
  
  switch (period) {
    case "daily": {
      day += 1;
      // Handle month/year rollover
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      if (day > daysInMonth) {
        day = 1;
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
      return getMidnightInTimezone(year, month, day, tz);
    }
    case "weekly": {
      day += 7;
      // Handle month/year rollover
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      while (day > daysInMonth) {
        day -= daysInMonth;
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
      return getMidnightInTimezone(year, month, day, tz);
    }
    case "monthly": {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      return getMidnightInTimezone(year, month, 1, tz);
    }
  }
}

/**
 * Format period start timestamp as a date range string
 */
export function formatPeriodRange(periodStart: number, period: PeriodType, timezone?: string): string {
  const tz = timezone || getUserTimezone();
  const startDate = new Date(periodStart);
  const endDate = new Date(getPeriodEnd(periodStart, period, tz));
  
  switch (period) {
    case "daily": {
      return startDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: tz,
      });
    }
    case "weekly": {
      // Get the last day of the week (Saturday, which is endDate - 1ms)
      const lastDayOfWeek = new Date(endDate.getTime() - 1);
      
      const startStr = startDate.toLocaleDateString("en-US", {
        timeZone: tz,
        month: "long",
        day: "numeric",
      });
      
      const endStr = lastDayOfWeek.toLocaleDateString("en-US", {
        timeZone: tz,
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      
      const startParts = startStr.split(" ");
      const endParts = endStr.split(" ");
      
      if (startParts[0] === endParts[0]) {
        // Same month
        return `${startParts[0]} ${startParts[1].replace(",", "")}-${endParts[1]}`;
      } else {
        return `${startStr}-${endStr}`;
      }
    }
    case "monthly": {
      return startDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: tz,
      });
    }
  }
}
