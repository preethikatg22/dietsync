// ─────────────────────────────────────────────────────────────────────────────
// MonthlyChart — per-day calorie adherence percentage for the current month.
// Requirements: 9.2
// ─────────────────────────────────────────────────────────────────────────────

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { DailyAdherence } from '../../types/index.ts';

interface MonthlyChartProps {
  monthlyStats: DailyAdherence[];
}

interface ChartDataPoint {
  day: string;
  adherencePct: number;
}

function toChartData(stats: DailyAdherence[]): ChartDataPoint[] {
  return stats.map((s) => ({
    day: s.date.slice(8), // DD portion of YYYY-MM-DD
    adherencePct: Math.round(s.adherencePct),
  }));
}

interface TooltipPayloadEntry {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-md text-sm">
      <p className="font-semibold text-gray-700 dark:text-gray-300">Day {label}</p>
      <p className="text-gray-600 dark:text-gray-400">{payload[0].value}% adherence</p>
    </div>
  );
}

export function MonthlyChart({ monthlyStats }: MonthlyChartProps) {
  const hasData = monthlyStats.some((s) => s.adherencePct > 0);

  if (monthlyStats.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
          Monthly Adherence
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No data available for this month.
        </p>
      </div>
    );
  }

  const chartData = toChartData(monthlyStats);

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Monthly Adherence
      </h2>

      {!hasData && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          No food logged this month yet.
        </p>
      )}

      <div className="h-48" role="img" aria-label="Monthly calorie adherence chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="adherenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[0, 150]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
            <Area
              type="monotone"
              dataKey="adherencePct"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#adherenceGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#10b981' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
