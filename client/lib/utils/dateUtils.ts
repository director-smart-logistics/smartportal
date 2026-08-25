export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

export function getMonthName(date: Date): string {
  return date.toLocaleString("en-US", { month: "short" });
}

export function getMonthYear(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export function getLastNMonths(n: number): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(1);
  startDate.setMonth(startDate.getMonth() - (n - 1));
  endDate.setDate(31);

  return {
    startDate,
    endDate,
    label: `Last ${n} months`,
  };
}

export function getCurrentYear(): DateRange {
  const startDate = new Date(new Date().getFullYear(), 0, 1);
  const endDate = new Date();

  return {
    startDate,
    endDate,
    label: "Current Year",
  };
}

export function getPreviousYear(): DateRange {
  const year = new Date().getFullYear() - 1;
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  return {
    startDate,
    endDate,
    label: "Previous Year",
  };
}

export function getCustomRange(startDate: Date, endDate: Date): DateRange {
  return {
    startDate,
    endDate,
    label: `${formatDate(startDate)} - ${formatDate(endDate)}`,
  };
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getMonthsInRange(
  startDate: Date,
  endDate: Date,
): { month: string; year: number; date: Date }[] {
  const months: { month: string; year: number; date: Date }[] = [];
  const current = new Date(startDate);
  current.setDate(1);

  while (current <= endDate) {
    months.push({
      month: getMonthName(current),
      year: current.getFullYear(),
      date: new Date(current),
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

export function getQuartersInRange(
  startDate: Date,
  endDate: Date,
): { quarter: number; year: number; date: Date }[] {
  const quarters: { quarter: number; year: number; date: Date }[] = [];
  const current = new Date(startDate);
  current.setMonth(Math.floor(current.getMonth() / 3) * 3);
  current.setDate(1);

  while (current <= endDate) {
    const quarter = Math.floor(current.getMonth() / 3) + 1;
    quarters.push({
      quarter,
      year: current.getFullYear(),
      date: new Date(current),
    });
    current.setMonth(current.getMonth() + 3);
  }

  return quarters;
}

export function compareYearOverYear(
  currentDate: Date,
  previousDate: Date,
  value: number,
): {
  percentageChange: number;
  isPositive: boolean;
} {
  // Use timestamps for arithmetic
  const currentMs = currentDate.getTime();
  const previousMs = previousDate.getTime();
  const percentageChange = ((currentMs - previousMs) / previousMs) * 100;
  return {
    percentageChange: Math.round(percentageChange * 10) / 10,
    isPositive: percentageChange >= 0,
  };
}
