import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { Card } from "@/components/ui/card";
import {
  Package as PackageIcon,
  TrendingUp,
  CheckCircle,
  DollarSign,
  Weight,
  Clock,
  Calendar,
} from "lucide-react";
import type { CustomerStats as CustomerStatsType } from "@/types";
import { formatRelativeTime } from "@/lib/utils/customerStats";
import { cn } from "@/lib/utils";

interface CustomerStatsProps {
  stats: CustomerStatsType;
  className?: string;
}

export function CustomerStats({ stats, className }: CustomerStatsProps) {
  const { t } = useLocale(["customers", "common"]);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const StatCard = ({
    icon: Icon,
    label,
    value,
    subtitle,
    iconColor,
    testId,
  }: {
    icon: any;
    label: string;
    value: string | number;
    subtitle?: string;
    iconColor?: string;
    testId?: string;
  }) => (
    <Card
      className={cn(
        "p-4 transition-all hover:shadow-md",
        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "p-2 rounded-lg flex-shrink-0",
            isDark ? "bg-gray-700" : "bg-gray-100",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              iconColor || (isDark ? "text-gray-400" : "text-gray-600"),
            )}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium mb-0.5 truncate",
              isDark ? "text-gray-400" : "text-gray-600",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "text-lg font-bold truncate",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p
              className={cn(
                "text-xs mt-0.5 truncate",
                isDark ? "text-gray-500" : "text-gray-500",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
        className,
      )}
    >
      <StatCard
        icon={PackageIcon}
        label={t("customers.detailsPage.stats.totalPackages")}
        value={stats.totalPackages}
        iconColor={isDark ? "text-blue-400" : "text-blue-600"}
        testId="stat-total-packages"
      />

      <StatCard
        icon={TrendingUp}
        label={t("customers.detailsPage.stats.activePackages")}
        value={stats.activePackages}
        subtitle={
          stats.totalPackages > 0
            ? `${((stats.activePackages / stats.totalPackages) * 100).toFixed(0)}% of total`
            : "0% of total"
        }
        iconColor={isDark ? "text-orange-400" : "text-orange-600"}
        testId="stat-active-packages"
      />

      <StatCard
        icon={CheckCircle}
        label={t("customers.detailsPage.stats.deliveredPackages")}
        value={stats.deliveredPackages}
        subtitle={
          stats.totalPackages > 0
            ? `${((stats.deliveredPackages / stats.totalPackages) * 100).toFixed(0)}% delivery rate`
            : "0% delivery rate"
        }
        iconColor={isDark ? "text-green-400" : "text-green-600"}
        testId="stat-delivered-packages"
      />

      <StatCard
        icon={DollarSign}
        label={t("customers.detailsPage.stats.totalValue")}
        value={new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(stats.totalValue)}
        iconColor={isDark ? "text-purple-400" : "text-purple-600"}
        testId="stat-total-value"
      />

      <StatCard
        icon={Weight}
        label={t("customers.detailsPage.stats.totalWeight")}
        value={`${Number(stats.totalWeight || 0).toFixed(2)} kg`}
        subtitle={`Avg: ${Number(stats.averagePackageWeight || 0).toFixed(2)} kg`}
        iconColor={isDark ? "text-cyan-400" : "text-cyan-600"}
        testId="stat-total-weight"
      />

      <StatCard
        icon={Calendar}
        label={t("customers.detailsPage.stats.daysAsCustomer")}
        value={stats.daysAsCustomer}
        subtitle={`${Math.floor(stats.daysAsCustomer / 30)} months`}
        iconColor={isDark ? "text-indigo-400" : "text-indigo-600"}
        testId="stat-days-as-customer"
      />

      <StatCard
        icon={Clock}
        label={t("customers.detailsPage.stats.lastActivity")}
        value={
          stats.lastActivityDate
            ? formatRelativeTime(stats.lastActivityDate)
            : t("customers.detailsPage.info.never")
        }
        subtitle={
          stats.lastActivityDate
            ? new Date(stats.lastActivityDate).toLocaleDateString()
            : undefined
        }
        iconColor={isDark ? "text-pink-400" : "text-pink-600"}
        testId="stat-last-activity"
      />

      <StatCard
        icon={PackageIcon}
        label={t("customers.detailsPage.stats.averageWeight")}
        value={`${Number(stats.averagePackageWeight || 0).toFixed(2)} kg`}
        iconColor={isDark ? "text-teal-400" : "text-teal-600"}
        testId="stat-average-weight"
      />
    </div>
  );
}
