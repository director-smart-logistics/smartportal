import { createContext, useContext, ReactNode, useMemo } from "react";

export interface FeatureFlags {
  // Dashboard sections
  dashboardDeliveryTrends: boolean;
  dashboardPackageStatus: boolean;
  dashboardRevenueVsCost: boolean;
  dashboardTopRoutes: boolean;
  dashboardQuickActions: boolean;
  dashboardKpiCards: boolean;

  // Features
  monthlyComparison: boolean;
  timeRangeSelector: boolean;
  advancedAnalytics: boolean;
  dataGridExport: boolean;
  auditLogs: boolean;

  // UI Elements
  globalSearch: boolean;
  darkMode: boolean;
  notificationCenter: boolean;
  routeReturnsModule: boolean;
}

const defaultFlags: FeatureFlags = {
  dashboardDeliveryTrends: true,
  dashboardPackageStatus: true,
  dashboardRevenueVsCost: true,
  dashboardTopRoutes: true,
  dashboardQuickActions: true,
  dashboardKpiCards: true,

  monthlyComparison: true,
  timeRangeSelector: true,
  advancedAnalytics: true,
  dataGridExport: true,
  auditLogs: true,

  globalSearch: true,
  darkMode: true,
  notificationCenter: false,
  routeReturnsModule: true,
};

const FeatureFlagsContext = createContext<FeatureFlags>(defaultFlags);

interface FeatureFlagsProviderProps {
  children: ReactNode;
  flags?: Partial<FeatureFlags>;
}

export function FeatureFlagsProvider({
  children,
  flags,
}: FeatureFlagsProviderProps) {
  const mergedFlags = useMemo(
    () => ({ ...defaultFlags, ...(flags || {}) }),
    [flags],
  );

  return (
    <FeatureFlagsContext.Provider value={mergedFlags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    return defaultFlags;
  }
  return context;
}

export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  const flags = useFeatureFlags();
  return flags[flag] ?? false;
}
