// ─────────────────────────────────────────────────────────────────────────────
// WeeklyChart — Recharts BarChart showing Mon–Sun calorie adherence.
// Requirements: 9.1, 9.5, 9.8
// ─────────────────────────────────────────────────────────────────────────────
//
// Adherence per day = (consumed / target) × 100.
// Days with no entries show 0%. When the entire week has no logged days,
// an empty-state message is shown instead of the chart.

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { DailyAdherence, WeeklyStats } from '../../types/index.ts';

interface WeeklyChartProps {
  weeklyStats: WeeklyStats | null;
  monthlyStats: DailyAdherence[];
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

interface ChartDataPoint {
  day: string;
  adherencePct: number;
}

/**
 * Build Mon–Sun chart data from the full monthly adherence array.
 * `weekOf` is the ISO date of the Monday of the current week (from WeeklyStats).
 */
function buildWeekData(
  weekOf: string,
  monthlyStats: DailyAdherence[],
): ChartDataPoint[] {
  const monday = new Date(weekOf + 'T00:00:00');
  const result: ChartDataPoint[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay(); // 0 = Sun

    const match = monthlyStats.find((m) => m.date === dateStr);
    result.push({
      day: DAY_LABELS[dayOfWeek] ?? dateStr,
      adherencePct: match ? Math.round(match.adherencePct) : 0,
    });
  }

  return result;
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
      <p className="font-semibold text-gray-700 dark:text-gray-300">{label}</p>
      <p className="text-gray-600 dark:text-gray-400">{payload[0].value}% adherence</p>
    </div>
  );
}

export function WeeklyChart({ weeklyStats, monthlyStats }: WeeklyChartProps) {
  // Show empty state when no logs this week (Req 9.8)
  if (!weeklyStats || weeklyStats.daysLogged === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
          Weekly Adherence
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No data logged for this week.
        </p>
      </div>
    );
  }

  const chartData = buildWeekData(weeklyStats.weekOf, monthlyStats);

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Weekly Adherence
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Avg {Math.round(weeklyStats.averageCalories)} kcal / {weeklyStats.targetCalories} target
        </span>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        {weeklyStats.daysLogged} day{weeklyStats.daysLogged !== 1 ? 's' : ''} logged this week
      </p>

      <div className="h-48" role="img" aria-label="Weekly calorie adherence chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 150]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* 100% target reference line */}
            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
            <Bar
              dataKey="adherencePct"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
