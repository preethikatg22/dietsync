// ─────────────────────────────────────────────────────────────────────────────
// EntryRow — a single log entry with inline edit and remove controls
// Requirements: 5.4, 5.5
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { type LogEntry } from '../../types/index.ts';

interface EntryRowProps {
  entry: LogEntry;
  onEdit: (entryId: string, grams: number) => void;
  onRemove: (entryId: string) => void;
}

/**
 * Renders a single food log entry with:
 * - Food name, serving grams, and macros summary
 * - Inline edit mode: replace serving size input and confirm
 * - Remove button
 *
 * (Req 5.4, 5.5)
 */
export function EntryRow({ entry, onEdit, onRemove }: EntryRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editGrams, setEditGrams] = useState(String(entry.servingGrams));
  const [editError, setEditError] = useState('');

  function handleEditConfirm() {
    const grams = parseFloat(editGrams);
    if (!editGrams || isNaN(grams) || grams <= 0) {
      setEditError('Enter a positive number.');
      return;
    }
    setEditError('');
    onEdit(entry.id, grams);
    setIsEditing(false);
  }

  function handleEditCancel() {
    setEditGrams(String(entry.servingGrams));
    setEditError('');
    setIsEditing(false);
  }

  return (
    <li className="flex items-start justify-between gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      {/* Left: food info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {entry.foodName}
        </p>

        {isEditing ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <label htmlFor={`edit-grams-${entry.id}`} className="sr-only">
              Serving size in grams
            </label>
            <input
              id={`edit-grams-${entry.id}`}
              type="number"
              min="0.1"
              step="any"
              value={editGrams}
              onChange={(e) => {
                setEditGrams(e.target.value);
                if (editError) setEditError('');
              }}
              aria-label="Serving size in grams"
              aria-describedby={editError ? `edit-error-${entry.id}` : undefined}
              aria-invalid={!!editError}
              className={`w-24 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-gray-100 ${
                editError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              autoFocus
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">g</span>
            <button
              type="button"
              onClick={handleEditConfirm}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleEditCancel}
              className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
            >
              Cancel
            </button>
            {editError && (
              <p id={`edit-error-${entry.id}`} role="alert" className="w-full text-xs text-red-600 mt-0.5">
                {editError}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {entry.servingGrams}g &middot;{' '}
            <span data-testid="entry-calories">{Math.round(entry.calories)} kcal</span> &middot; P{' '}
            {entry.protein.toFixed(1)}g · C {entry.carbs.toFixed(1)}g · F{' '}
            {entry.fat.toFixed(1)}g
          </p>
        )}
      </div>

      {/* Right: action buttons */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            aria-label={`Edit ${entry.foodName}`}
            className="rounded p-1.5 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemove(entry.id)}
            aria-label={`Remove ${entry.foodName}`}
            className="rounded p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}
