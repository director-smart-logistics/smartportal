import { memo } from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  PieChart,
  Line,
  Bar,
  Area,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NovaChartData } from "@/lib/services/nova-agent-engine";

interface NovaChartProps {
  chart: NovaChartData;
}

const PIE_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#ec4899",
  "#14b8a6",
];

const formatValue = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

const formatCount = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

export const NovaChart = memo(function NovaChart({ chart }: NovaChartProps) {
  const isRevenue = chart.series.some((s) => s.key === "revenue");
  const tickFormatter = isRevenue ? formatValue : formatCount;
  const tooltipFormatter = (value: number, name: string) => [
    isRevenue ? `$${value.toFixed(2)}` : String(value),
    name,
  ];

  const renderCartesian = (
    ChartComp: typeof LineChart | typeof BarChart | typeof AreaChart,
  ) => (
    <ChartComp
      data={chart.data}
      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
    >
      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        label={
          chart.xAxisLabel
            ? {
                value: chart.xAxisLabel,
                position: "insideBottom",
                offset: -4,
                fontSize: 11,
              }
            : undefined
        }
      />
      <YAxis
        tickFormatter={tickFormatter}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={52}
        label={
          chart.yAxisLabel
            ? {
                value: chart.yAxisLabel,
                angle: -90,
                position: "insideLeft",
                fontSize: 11,
              }
            : undefined
        }
      />
      <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12 }} />
      {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      {chart.series.map((s) => {
        if (ChartComp === AreaChart) {
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || "#6366f1"}
              fill={s.color || "#6366f1"}
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
            />
          );
        }
        if (ChartComp === LineChart) {
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || "#6366f1"}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          );
        }
        return (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color || "#6366f1"}
            radius={[3, 3, 0, 0]}
          />
        );
      })}
    </ChartComp>
  );

  const renderPie = () => (
    <PieChart>
      <Pie
        data={chart.data}
        dataKey={chart.series[0]?.key || "value"}
        nameKey="label"
        cx="50%"
        cy="50%"
        outerRadius={90}
        innerRadius={45}
        paddingAngle={2}
        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        labelLine={false}
      >
        {chart.data.map((_, i) => (
          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip
        formatter={(v: number) => [isRevenue ? `$${v.toFixed(2)}` : String(v)]}
        contentStyle={{ fontSize: 12 }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </PieChart>
  );

  return (
    <div className="rounded-2xl border border-[#e8eaed] bg-white p-4 mt-2 w-full shadow-sm">
      {/* Header */}
      <div className="mb-3">
        <p className="text-sm font-semibold text-[#1f1f1f]">{chart.title}</p>
        {chart.subtitle && (
          <p className="text-xs text-[#70757a] mt-0.5">{chart.subtitle}</p>
        )}
      </div>

      {/* Chart */}
      <div
        className="w-full"
        style={{ height: chart.type === "pie" ? 260 : 220 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie"
            ? renderPie()
            : chart.type === "line"
              ? renderCartesian(LineChart)
              : chart.type === "area"
                ? renderCartesian(AreaChart)
                : renderCartesian(BarChart)}
        </ResponsiveContainer>
      </div>

      {/* Insight pill */}
      {chart.insight && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e8f0fe] border border-[#c5d8fd] text-xs font-medium text-[#1a73e8]">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#1a73e8]" />
          {chart.insight}
        </div>
      )}
    </div>
  );
});
