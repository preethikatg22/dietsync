// ─────────────────────────────────────────────────────────────────────────────
// MealSection — entry list for a single meal (Breakfast/Lunch/Dinner/Snacks)
// Requirements: 5.1, 5.4, 5.5
// ─────────────────────────────────────────────────────────────────────────────

import type { LogEntry, MealSection as MealSectionType } from '../../types/index.ts';
import { aggregateDayLog } from '../../services/NutritionCalculator.ts';

interface MealSectionProps {
  /** The meal section identifier */
  section: MealSectionType;
  /** All entries that belong to this section */
  entries: LogEntry[];
  /** Called when the user clicks "Add food" for this section */
  onAddFood: (section: MealSectionType) => void;
  /** Called when the user clicks the edit (pencil) icon for an entry */
  onEditEntry: (entry: LogEntry) => void;
  /** Called when the user clicks the remove (trash) icon for an entry */
  onRemoveEntry: (entryId: string) => void;
}

const SECTION_LABELS: Record<MealSectionType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

/**
 * Renders one meal section with its entries and section-level calorie total.
 * Each entry has an edit button (pencil) and a remove button (trash). (Req 5.1, 5.4, 5.5)
 *
 * The outer <section> element has role="region" (implicit) and an aria-label
 * so tests can query it with `screen.getByRole('region', { name: /breakfast/i })`.
 * The calorie total span carries an aria-label in the form
 * "Breakfast total: 370 calories" for accessible and test queries.
 */
export function MealSection({
  section,
  entries,
  onAddFood,
  onEditEntry,
  onRemoveEntry,
}: MealSectionProps) {
  const totals = aggregateDayLog(entries);
  const label = SECTION_LABELS[section];
  const roundedCalories = Math.round(totals.calories);

  return (
    <section
      aria-label={`${label} meal section`}
      className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{label}</span>
          {/* Always show calorie total with aria-label for accessibility and tests */}
          <span
            aria-label={`${label} total: ${roundedCalories} calories`}
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            {roundedCalories === 0 ? '0 kcal' : `${roundedCalories} kcal`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAddFood(section)}
          aria-label={`Add food to ${label}`}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add food
        </button>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="px-4 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
          No entries yet
        </div>
      ) : (
        <ul>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onEdit={onEditEntry}
              onRemove={onRemoveEntry}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EntryRow — a single logged food item
// ─────────────────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: LogEntry;
  onEdit: (entry: LogEntry) => void;
  onRemove: (entryId: string) => void;
}

function EntryRow({ entry, onEdit, onRemove }: EntryRowProps) {
  return (
    <li className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0 gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
          {entry.foodName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {entry.servingGrams}g &middot;{' '}
          <span className="text-gray-700 dark:text-gray-300">
            {Math.round(entry.calories)} kcal
          </span>
          {' '}&middot; P {entry.protein.toFixed(1)}g &middot; C {entry.carbs.toFixed(1)}g &middot; F {entry.fat.toFixed(1)}g
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Edit button */}
        <button
          type="button"
          onClick={() => onEdit(entry)}
          aria-label={`Edit ${entry.foodName}`}
          className="rounded-md p-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label={`Remove ${entry.foodName}`}
          className="rounded-md p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </li>
  );
}
