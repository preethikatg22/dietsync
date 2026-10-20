// ─────────────────────────────────────────────────────────────────────────────
// MealBreakdown — lists each meal section with its total calories and macros.
// Requirements: 6.3
// ─────────────────────────────────────────────────────────────────────────────

import { type DayLog, type MealSection, type DayTotals } from '../../types/index.ts';
import { aggregateDayLog } from '../../services/NutritionCalculator.ts';

interface MealBreakdownProps {
  dayLog: DayLog;
}

const MEAL_SECTIONS: MealSection[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

const MEAL_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

const MEAL_ICONS: Record<MealSection, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snacks: '🍎',
};

function MacroRow({ label, totals }: { label: string; totals: DayTotals }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">
          {MEAL_ICONS[label.toLowerCase() as MealSection]}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {Math.round(totals.calories)} kcal
        </span>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          P {totals.protein.toFixed(1)}g &middot; C {totals.carbs.toFixed(1)}g &middot; F {totals.fat.toFixed(1)}g
        </div>
      </div>
    </div>
  );
}

export function MealBreakdown({ dayLog }: MealBreakdownProps) {
  const sectionTotals = MEAL_SECTIONS.map((section) => {
    const entries = dayLog.entries.filter((e) => e.mealSection === section);
    const totals = aggregateDayLog(entries);
    return { section, label: MEAL_LABELS[section], totals, hasEntries: entries.length > 0 };
  });

  const anyEntries = dayLog.entries.length > 0;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Meal Breakdown
      </h2>

      {anyEntries ? (
        <div>
          {sectionTotals.map(({ section, label, totals, hasEntries }) => (
            hasEntries ? (
              <MacroRow key={section} label={label} totals={totals} />
            ) : null
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          No food logged today. Head to the log page to add meals.
        </p>
      )}
    </div>
  );
}
