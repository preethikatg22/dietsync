// ─────────────────────────────────────────────────────────────────────────────
// MacroRing — Recharts PieChart showing protein/carbs/fat consumed grams
// and percentages for the current day.
// Requirements: 6.2
// ─────────────────────────────────────────────────────────────────────────────

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface MacroRingProps {
  protein: number;
  carbs: number;
  fat: number;
}

const MACRO_COLORS = {
  Protein: '#6366f1', // indigo
  Carbs: '#f59e0b',   // amber
  Fat: '#ec4899',     // pink
} as const;

interface TooltipPayloadEntry {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-md text-sm">
      <span className="font-semibold text-gray-700 dark:text-gray-300">{entry.name}:</span>{' '}
      <span className="text-gray-600 dark:text-gray-400">{entry.value.toFixed(1)} g</span>
    </div>
  );
}

export function MacroRing({ protein, carbs, fat }: MacroRingProps) {
  const total = protein + carbs + fat;

  const data = [
    { name: 'Protein', value: protein, pct: total > 0 ? (protein / total) * 100 : 0 },
    { name: 'Carbs', value: carbs, pct: total > 0 ? (carbs / total) * 100 : 0 },
    { name: 'Fat', value: fat, pct: total > 0 ? (fat / total) * 100 : 0 },
  ];

  // When no macros are consumed, show a grey placeholder ring
  const isEmpty = total === 0;
  const chartData = isEmpty
    ? [{ name: 'No data', value: 1, pct: 0 }]
    : data;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Macros
      </h2>

      <div className="flex items-center gap-4">
        {/* Pie chart */}
        <div className="h-36 w-36 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="85%"
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={0}
              >
                {isEmpty ? (
                  <Cell fill="#e5e7eb" />
                ) : (
                  data.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={MACRO_COLORS[entry.name as keyof typeof MACRO_COLORS]}
                    />
                  ))
                )}
              </Pie>
              {!isEmpty && <Tooltip content={<CustomTooltip />} />}
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with grams + % */}
        <div className="flex flex-col gap-2 flex-1">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: MACRO_COLORS[entry.name as keyof typeof MACRO_COLORS] }}
                aria-hidden="true"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 w-14">{entry.name}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {entry.value.toFixed(1)} g
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({entry.pct.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
