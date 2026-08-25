import { getMonthName, getMonthsInRange } from "./dateUtils";
import type { DateRange } from "./dateUtils";

export interface MonthlyMetric {
  month: string;
  delivered: number;
  pending: number;
  failed: number;
  revenue: number;
  cost: number;
}

export interface ComparisonMetric {
  period: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

export function generateMonthlyMetrics(range: DateRange): MonthlyMetric[] {
  const months = getMonthsInRange(range.startDate, range.endDate);
  const baseValues = {
    delivered: 200,
    pending: 100,
    failed: 20,
    revenue: 15000,
    cost: 8000,
  };

  return months.map((m, index) => ({
    month: `${getMonthName(m.date)}`,
    delivered:
      baseValues.delivered + Math.floor(Math.random() * 300) + index * 50,
    pending: baseValues.pending + Math.floor(Math.random() * 100),
    failed: baseValues.failed + Math.floor(Math.random() * 30),
    revenue:
      baseValues.revenue + Math.floor(Math.random() * 10000) + index * 1000,
    cost: baseValues.cost + Math.floor(Math.random() * 5000),
  }));
}

export function generateComparisonMetrics(
  currentRange: DateRange,
  previousRange: DateRange,
): ComparisonMetric[] {
  const currentMonths = getMonthsInRange(
    currentRange.startDate,
    currentRange.endDate,
  );
  const previousMonths = getMonthsInRange(
    previousRange.startDate,
    previousRange.endDate,
  );

  const metrics: ComparisonMetric[] = [];

  for (
    let i = 0;
    i < Math.min(currentMonths.length, previousMonths.length);
    i++
  ) {
    const currentValue = Math.floor(Math.random() * 1000) + 500;
    const previousValue = Math.floor(Math.random() * 1000) + 400;
    const change = currentValue - previousValue;
    const changePercent = (change / previousValue) * 100;

    metrics.push({
      period: getMonthName(currentMonths[i].date),
      current: currentValue,
      previous: previousValue,
      change,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }

  return metrics;
}

export function generatePackageStatusData() {
  return [
    { name: "Delivered", value: 2540, color: "#000000" }, // Black
    { name: "In Transit", value: 1040, color: "#FCD34D" }, // Yellow
    { name: "Pending", value: 840, color: "#CCCCCC" }, // Light gray
    { name: "Failed", value: 225, color: "#666666" }, // Dark gray
  ];
}

export function generateRevenueData(range: DateRange) {
  const days = Math.floor(
    (range.endDate.getTime() - range.startDate.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const data = [];

  for (let i = 0; i < Math.min(days, 30); i++) {
    const date = new Date(range.startDate);
    date.setDate(date.getDate() + i);
    const dayName = date.toLocaleString("en-US", { weekday: "short" });

    data.push({
      date: dayName,
      revenue: Math.floor(Math.random() * 5000) + 2000,
      cost: Math.floor(Math.random() * 3000) + 1500,
    });
  }

  return data;
}

export function generateTopRoutesData() {
  const routes = [
    { route: "Miami → San Jose", packages: 234, revenue: 5600 },
    { route: "Miami → Panama", packages: 156, revenue: 3900 },
    { route: "Miami → Belize", packages: 89, revenue: 2100 },
    { route: "Miami → Ecuador", packages: 67, revenue: 1800 },
  ];

  return routes.map((route) => ({
    ...route,
    packages: route.packages + Math.floor(Math.random() * 50),
    revenue: route.revenue + Math.floor(Math.random() * 1000),
  }));
}

export function generateKpiMetrics(range: DateRange) {
  const months = getMonthsInRange(range.startDate, range.endDate);
  const monthCount = months.length;

  const totalPackages = 4645 + monthCount * 100;
  const inTransit = 1040 + Math.floor(Math.random() * 500);
  const delivered = 2540 + monthCount * 80;
  const revenue = 34250 + monthCount * 2000;

  return [
    {
      label: "dashboard.totalPackages",
      value: totalPackages.toLocaleString(),
      change: `+${Math.floor(12.5 + monthCount * 0.5)}%`,
      icon: "Package",
      bg: "bg-blue-500/10",
    },
    {
      label: "dashboard.packagesInTransit",
      value: inTransit.toLocaleString(),
      change: `+${Math.floor(4.2 + Math.random() * 10)}%`,
      icon: "TrendingUp",
      bg: "bg-purple-500/10",
    },
    {
      label: "dashboard.delivered",
      value: delivered.toLocaleString(),
      change: `+${Math.floor(23.1 + monthCount * 1)}%`,
      icon: "CheckCircle",
      bg: "bg-green-500/10",
    },
    {
      label: "dashboard.revenue",
      value: `$${revenue.toLocaleString()}`,
      change: `+${Math.floor(8.3 + Math.random() * 15)}%`,
      icon: "DollarSign",
      bg: "bg-yellow-500/10",
    },
  ];
}
