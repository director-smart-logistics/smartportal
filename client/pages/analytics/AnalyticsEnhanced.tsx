// @ts-nocheck
/* eslint-disable */
/**
 * AnalyticsEnhanced — kept for backwards compatibility.
 * The canonical Analytics page lives in Analytics.tsx.
 */
export { default } from "./Analytics";
function _unused() {
  const { t } = useLocale(['analytics', 'common']);
  const { theme } = useTheme();
  const [timeRange, setTimeRange] = useState("6m");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch analytics data with optional auto-refresh
  const { data, isLoading, error, refetch } = useAnalyticsOverview(timeRange, {
    refetchInterval: autoRefresh ? 60000 : undefined, // Refresh every 60 seconds when enabled
  });

  // Theme-aware colors - monochromatic
  const isDark = theme === "dark";
  const colors = {
    line: isDark ? "#F3F4F6" : "#1F2937",
    area: isDark ? "#F3F4F6" : "#1F2937",
    bar: isDark ? "#E5E7EB" : "#374151",
    gridStroke: isDark ? "#374151" : "#E5E7EB",
    tooltipBg: isDark ? "#1F2937" : "#FFFFFF",
    tooltipBorder: isDark ? "#4B5563" : "#D1D5DB",
  };

  // Monochromatic colors for pie chart
  const pieColors = isDark
    ? ["#F9FAFB", "#E5E7EB", "#D1D5DB", "#9CA3AF", "#6B7280"]
    : ["#111827", "#374151", "#4B5563", "#6B7280", "#9CA3AF"];

  const handleExport = () => {
    if (!data) return;

    const exportData = {
      timeRange,
      generatedAt: new Date().toISOString(),
      ...data,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${timeRange}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (error) {
    return (
      <DashboardLayout>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="p-4 md:p-6"
        >
          <Alert variant="destructive" data-testid="analytics-error">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t("common.error")}</AlertTitle>
            <AlertDescription>{t("analytics.error") || t("common.error") || "An error occurred while loading analytics data"}</AlertDescription>
          </Alert>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-between flex-wrap gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="analytics-title">
              {t("analytics.title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {t("analytics.subtitle")}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger 
                className="w-36 text-sm"
                data-testid="time-range-selector"
                aria-label={t("analytics.timeRange")}
              >
                <Calendar className="h-4 w-4 mr-2" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" data-testid="range-7d">{t("analytics.last7Days")}</SelectItem>
                <SelectItem value="1m" data-testid="range-1m">{t("analytics.lastMonth")}</SelectItem>
                <SelectItem value="3m" data-testid="range-3m">{t("analytics.last3Months")}</SelectItem>
                <SelectItem value="6m" data-testid="range-6m">{t("analytics.last6Months")}</SelectItem>
                <SelectItem value="1y" data-testid="range-1y">{t("analytics.lastYear")}</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              size="sm"
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              data-testid="auto-refresh-toggle"
              aria-label={autoRefresh ? t("analytics.autoRefresh") : t("analytics.refresh")}
              className={autoRefresh ? "bg-gray-900 text-gray-50 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900" : ""}
            >
              <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="hidden sm:inline ml-2">
                {autoRefresh ? t("analytics.autoRefresh") : t("analytics.refresh")}
              </span>
            </Button>

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleExport}
              disabled={!data || isLoading}
              data-testid="export-button"
              aria-label={t("analytics.exportData")}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline ml-2">{t("common.export")}</span>
            </Button>
          </div>
        </motion.div>

        {isLoading ? (
          <>
            {/* Top KPIs Skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              data-testid="analytics-loading-kpis"
            >
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-3">
                  <SkeletonStatCard />
                </Card>
              ))}
            </motion.div>

            {/* Charts Grid Skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="analytics-loading-charts"
            >
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="p-3">
                  <SkeletonChart />
                </Card>
              ))}
            </motion.div>

            {/* Summary Section Skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
              data-testid="analytics-loading-summary"
            >
              <Card className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                      <div className="h-4 w-64 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </>
        ) : !data ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          >
            <Alert data-testid="analytics-no-data">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>{t("common.info")}</AlertTitle>
              <AlertDescription>{t("analytics.noData") || t("common.noData") || "No data available"}</AlertDescription>
            </Alert>
          </motion.div>
        ) : (
          <>
            {/* Top KPIs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              role="region"
              aria-label={t("analytics.topMetrics.title")}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                <Card className="p-3" data-testid="kpi-revenue">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("analytics:topMetrics.totalRevenue") || t("analytics:totalRevenue") || "Total Revenue"}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(data?.topMetrics?.totalRevenue?.value || 0)}
                  </p>
                  <div
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      data?.topMetrics?.totalRevenue?.positive ? "text-gray-700 dark:text-gray-300" : "text-gray-500"
                    }`}
                    aria-label={`${data?.topMetrics?.totalRevenue?.positive ? "Increase" : "Decrease"} of ${formatPercentage(Math.abs(data?.topMetrics?.totalRevenue?.change || 0))}`}
                  >
                    {data?.topMetrics?.totalRevenue?.positive ? (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {formatPercentage(Math.abs(data?.topMetrics?.totalRevenue?.change || 0))}
                  </div>
                </div>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <Card className="p-3" data-testid="kpi-avg-order">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("analytics.topMetrics.avgOrderValue")}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(data?.topMetrics?.avgOrderValue?.value || 0)}
                  </p>
                  <div
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      data?.topMetrics?.avgOrderValue?.positive ? "text-gray-700 dark:text-gray-300" : "text-gray-500"
                    }`}
                    aria-label={`${data?.topMetrics?.avgOrderValue?.positive ? "Increase" : "Decrease"} of ${formatPercentage(Math.abs(data?.topMetrics?.avgOrderValue?.change || 0))}`}
                  >
                    {data?.topMetrics?.avgOrderValue?.positive ? (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {formatPercentage(Math.abs(data?.topMetrics?.avgOrderValue?.change || 0))}
                  </div>
                </div>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.25 }}
              >
                <Card className="p-3" data-testid="kpi-delivery-success">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("analytics.topMetrics.deliverySuccess")}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-lg font-bold text-foreground">
                    {formatPercentage(data?.topMetrics?.deliverySuccess?.value || 0)}
                  </p>
                  <div
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      data?.topMetrics?.deliverySuccess?.positive ? "text-gray-700 dark:text-gray-300" : "text-gray-500"
                    }`}
                    aria-label={`${data?.topMetrics?.deliverySuccess?.positive ? "Increase" : "Decrease"} of ${formatPercentage(Math.abs(data?.topMetrics?.deliverySuccess?.change || 0))}`}
                  >
                    {data?.topMetrics?.deliverySuccess?.positive ? (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {formatPercentage(Math.abs(data?.topMetrics?.deliverySuccess?.change || 0))}
                  </div>
                </div>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.3 }}
              >
                <Card className="p-3" data-testid="kpi-profit-margin">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("analytics.topMetrics.profitMargin")}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-lg font-bold text-foreground">
                    {formatPercentage(data?.topMetrics?.profitMargin?.value || 0)}
                  </p>
                  <div
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      data?.topMetrics?.profitMargin?.positive ? "text-gray-700 dark:text-gray-300" : "text-gray-500"
                    }`}
                    aria-label={`${data?.topMetrics?.profitMargin?.positive ? "Increase" : "Decrease"} of ${formatPercentage(Math.abs(data?.topMetrics?.profitMargin?.change || 0))}`}
                  >
                    {data?.topMetrics?.profitMargin?.positive ? (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {formatPercentage(Math.abs(data?.topMetrics?.profitMargin?.change || 0))}
                  </div>
                </div>
                </Card>
              </motion.div>
            </motion.div>

            {/* Charts Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              role="region"
              aria-label="Analytics Charts"
            >
              {/* Performance Metrics */}
              {data?.performanceMetrics && Array.isArray(data.performanceMetrics) && data.performanceMetrics.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                >
                  <Card className="p-3" data-testid="chart-performance">
                  <h3 className="text-xs font-semibold text-foreground mb-3">
                    {t("analytics:charts.performanceTrend") || t("analytics:performanceTrend") || "Performance Trend"}
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data.performanceMetrics || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.gridStroke} />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="efficiency"
                        stroke={colors.line}
                        strokeWidth={2}
                        dot={false}
                        name={t("analytics.charts.efficiency")}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </Card>
                </motion.div>
              )}

              {/* Revenue Trend */}
              {data?.revenueTrend && Array.isArray(data.revenueTrend) && data.revenueTrend.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <Card className="p-3" data-testid="chart-revenue">
                  <h3 className="text-xs font-semibold text-foreground mb-3">
                    {t("analytics.charts.revenueGrowth")}
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={data.revenueTrend || []}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={colors.area} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={colors.area} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.gridStroke} />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke={colors.area}
                        fill="url(#colorRevenue)"
                        name={t("analytics.charts.revenue")}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  </Card>
                </motion.div>
              )}

              {/* Delivery Success */}
              {data?.deliveryTrend && Array.isArray(data.deliveryTrend) && data.deliveryTrend.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.35 }}
                >
                  <Card className="p-3" data-testid="chart-delivery">
                  <h3 className="text-xs font-semibold text-foreground mb-3">
                    {t("analytics.charts.deliverySuccess")}
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.deliveryTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.gridStroke} />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                        }}
                      />
                      <Bar
                        dataKey="delivered"
                        fill={colors.bar}
                        name={t("analytics.charts.delivered")}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  </Card>
                </motion.div>
              )}

              {/* Regional Distribution */}
              {data?.regionalDistribution && Array.isArray(data.regionalDistribution) && data.regionalDistribution.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <Card className="p-3" data-testid="chart-regional-mix">
                  <h3 className="text-xs font-semibold text-foreground mb-3">
                    {t("analytics.charts.regionalMix")}
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={data.regionalDistribution || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        dataKey="value"
                        label={false}
                      >
                        {(data.regionalDistribution || []).map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={pieColors[index % pieColors.length]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </Card>
                </motion.div>
              )}
            </motion.div>

            {/* Regional Performance Table */}
            {data?.regionalPerformance && Array.isArray(data.regionalPerformance) && data.regionalPerformance.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <Card className="p-4" data-testid="regional-performance-table">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  {t("analytics.regional.title")}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" role="table">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-semibold text-foreground">
                          {t("analytics.regional.region")}
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-foreground">
                          {t("analytics.regional.packages")}
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-foreground">
                          {t("analytics.regional.revenue")}
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-foreground">
                          {t("analytics.regional.cost")}
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-foreground">
                          {t("analytics.regional.margin")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.regionalPerformance || []).map((region, idx) => (
                        <tr
                          key={idx}
                          className="border-b hover:bg-muted/50 transition-colors"
                          data-testid={`region-row-${region?.region || idx}`}
                        >
                          <td className="py-2 px-3 font-medium text-foreground">
                            {region?.region || "-"}
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {(region?.packages || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-foreground font-medium">
                            {formatCurrency(region?.revenue || 0)}
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {formatCurrency(region?.cost || 0)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Badge variant="outline" className="text-xs">
                              {region?.margin || "-"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </Card>
              </motion.div>
            )}

            {/* Executive Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
            >
              <Card className="p-4 bg-slate-50 dark:bg-slate-900/30" data-testid="executive-summary">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {t("analytics.summary.title")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">
                    {t("analytics.summary.revenuePerformance")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("analytics.summary.revenueText")}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">
                    {t("analytics.summary.operationalEfficiency")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("analytics.summary.efficiencyText")}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">
                    {t("analytics.summary.strategicFocus")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("analytics.summary.focusText")}
                  </p>
                </div>
              </div>
              </Card>
            </motion.div>
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
