// ─────────────────────────────────────────────────────────────────────────────
// WeightEntryForm — date + weight inputs for logging a weight entry.
// Requirements: 8.1, 8.2
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

interface WeightEntryFormProps {
  onSubmit: (date: string, weightKg: number) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WeightEntryForm({ onSubmit }: WeightEntryFormProps) {
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!date) {
      setError('Date is required.');
      return;
    }

    const kg = parseFloat(weight);
    if (!weight || isNaN(kg) || kg <= 0) {
      setError('Weight must be a positive number.');
      return;
    }
    if (kg > 500) {
      setError('Weight must be at most 500 kg.');
      return;
    }

    onSubmit(date, kg);
    setWeight('');
    setSuccess(true);
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Log Weight
      </h2>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Date */}
        <div className="flex-1">
          <label
            htmlFor="weight-date"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            Date
          </label>
          <input
            id="weight-date"
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setSuccess(false); }}
            required
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Weight */}
        <div className="flex-1">
          <label
            htmlFor="weight-kg"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            Weight (kg)
          </label>
          <input
            id="weight-kg"
            type="number"
            inputMode="decimal"
            min="0.1"
            max="500"
            step="0.1"
            value={weight}
            placeholder="e.g. 72.5"
            onChange={(e) => { setWeight(e.target.value); setSuccess(false); }}
            required
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
        >
          Save
        </button>
      </form>

      {/* Validation error */}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}

      {/* Success feedback */}
      {success && (
        <p role="status" className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Weight logged successfully.
        </p>
      )}
    </div>
  );
}
