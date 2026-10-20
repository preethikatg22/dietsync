// ─────────────────────────────────────────────────────────────────────────────
// WeightChart — Recharts LineChart showing weight trend over time.
// Requirements: 8.3, 9.7
// ─────────────────────────────────────────────────────────────────────────────
//
// Only rendered when weightLog contains ≥ 2 entries.
// Entries are already sorted ascending by date (Req 9.7).

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import type { WeightEntry } from '../../types/index.ts';

interface WeightChartProps {
  weightLog: WeightEntry[];
}

interface ChartDataPoint {
  date: string;
  label: string;
  weightKg: number;
}

function toChartData(entries: WeightEntry[]): ChartDataPoint[] {
  return entries.map((e) => ({
    date: e.date,
    // Show MM/DD label for compactness
    label: e.date.slice(5).replace('-', '/'),
    weightKg: e.weightKg,
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
      <p className="font-semibold text-gray-700 dark:text-gray-300">{label}</p>
      <p className="text-gray-600 dark:text-gray-400">{payload[0].value} kg</p>
    </div>
  );
}

export function WeightChart({ weightLog }: WeightChartProps) {
  // Req 8.3: require at least 2 entries before rendering the chart
  if (weightLog.length < 2) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
          Weight Trend
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          Add at least 2 weight entries to see your trend.
        </p>
      </div>
    );
  }

  const chartData = toChartData(weightLog);
  const weights = weightLog.map((e) => e.weightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  // Add padding to the Y-axis domain
  const yMin = Math.floor(minW - 2);
  const yMax = Math.ceil(maxW + 2);

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Weight Trend
      </h2>

      <div className="h-52" role="img" aria-label="Weight trend chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}kg`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="weightKg"
              stroke="#10b981"
              strokeWidth={2}
              dot={<Dot r={3} fill="#10b981" stroke="#10b981" />}
              activeDot={{ r: 5, fill: '#10b981' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
