// ─────────────────────────────────────────────────────────────────────────────
// CustomFoodsManager — list, add, edit, and delete custom food items
// Requirements: 4.1–4.7
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useFoodStore, type NewCustomFood, type CustomFoodUpdates } from '../../stores/foodStore.ts';
import type { CustomFood, ValidationError } from '../../types/index.ts';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomFoodsManagerProps {
  userId: string;
}

// ── Empty form state ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  category: '',
  caloriesPer100g: '',
  proteinPer100g: '',
  carbsPer100g: '',
  fatPer100g: '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomFoodsManager({ userId }: CustomFoodsManagerProps) {
  const customFoods = useFoodStore((s) => s.customFoods);
  const addCustomFood = useFoodStore((s) => s.addCustomFood);
  const editCustomFood = useFoodStore((s) => s.editCustomFood);
  const deleteCustomFood = useFoodStore((s) => s.deleteCustomFood);
  const loadCustomFoods = useFoodStore((s) => s.loadCustomFoods);

  // Add-form state
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addErrors, setAddErrors] = useState<ValidationError[]>([]);

  // Edit state: null = not editing, string = id of food being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<ValidationError[]>([]);

  // Delete confirmation: null = not confirming, string = id pending deletion
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load custom foods on mount (Req 4.3)
  useEffect(() => {
    loadCustomFoods(userId);
  }, [userId, loadCustomFoods]);

  // ── Add ──────────────────────────────────────────────────────────────────────

  function handleAdd() {
    setAddErrors([]);
    const food: NewCustomFood = {
      name: addForm.name,
      category: addForm.category || 'custom',
      caloriesPer100g: Number(addForm.caloriesPer100g),
      proteinPer100g: Number(addForm.proteinPer100g),
      carbsPer100g: Number(addForm.carbsPer100g),
      fatPer100g: Number(addForm.fatPer100g),
    };
    const result = addCustomFood(food, userId);
    if (Array.isArray(result)) {
      setAddErrors(result);
      return;
    }
    setAddForm(EMPTY_FORM);
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit(food: CustomFood) {
    setEditingId(food.id);
    setEditErrors([]);
    setEditForm({
      name: food.name,
      category: food.category,
      caloriesPer100g: String(food.caloriesPer100g),
      proteinPer100g: String(food.proteinPer100g),
      carbsPer100g: String(food.carbsPer100g),
      fatPer100g: String(food.fatPer100g),
    });
  }

  function handleEditSave(id: string) {
    setEditErrors([]);
    const updates: CustomFoodUpdates = {
      name: editForm.name,
      category: editForm.category || 'custom',
      caloriesPer100g: Number(editForm.caloriesPer100g),
      proteinPer100g: Number(editForm.proteinPer100g),
      carbsPer100g: Number(editForm.carbsPer100g),
      fatPer100g: Number(editForm.fatPer100g),
    };
    const result = editCustomFood(id, updates, userId);
    if (Array.isArray(result)) {
      setEditErrors(result);
      return;
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditErrors([]);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    deleteCustomFood(id, userId);
    setConfirmDeleteId(null);
  }

  // ── Field error helper ────────────────────────────────────────────────────────

  function fieldError(errors: ValidationError[], field: string) {
    return errors.find((e) => e.field === field)?.message ?? '';
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Custom Foods
      </h2>

      {/* Existing custom foods list */}
      {customFoods.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No custom foods yet. Add one below.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700" aria-label="Custom foods list">
          {customFoods.map((food) => (
            <li key={food.id} className="py-3">
              {editingId === food.id ? (
                /* ── Inline edit form ── */
                <div className="space-y-3">
                  <EditFoodRow
                    form={editForm}
                    onChange={setEditForm}
                    errors={editErrors}
                    fieldError={(f) => fieldError(editErrors, f)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSave(food.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Read row ── */
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {food.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {food.category} · {food.caloriesPer100g} kcal · P {food.proteinPer100g}g · C{' '}
                      {food.carbsPer100g}g · F {food.fatPer100g}g per 100g
                    </p>
                    {/* Delete confirmation inline */}
                    {confirmDeleteId === food.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-red-600 dark:text-red-400">
                          Remove "{food.name}"?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(food.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-700 underline focus:outline-none"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs font-medium text-gray-500 hover:text-gray-700 underline focus:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(food)}
                      aria-label={`Edit ${food.name}`}
                      className="rounded-md bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(food.id)}
                      aria-label={`Delete ${food.name}`}
                      className="rounded-md bg-red-50 dark:bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add new custom food form */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Add custom food
        </h3>

        {/* Name & Category */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cf-name" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Name *
            </label>
            <input
              id="cf-name"
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="e.g. Homemade granola"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {fieldError(addErrors, 'name') && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {fieldError(addErrors, 'name')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="cf-category" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Category (optional)
            </label>
            <input
              id="cf-category"
              type="text"
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              placeholder="e.g. snacks"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Macro inputs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { id: 'cf-cal', key: 'caloriesPer100g', label: 'Kcal/100g *' },
              { id: 'cf-protein', key: 'proteinPer100g', label: 'Protein/100g *' },
              { id: 'cf-carbs', key: 'carbsPer100g', label: 'Carbs/100g *' },
              { id: 'cf-fat', key: 'fatPer100g', label: 'Fat/100g *' },
            ] as const
          ).map(({ id, key, label }) => (
            <div key={key}>
              <label htmlFor={id} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {label}
              </label>
              <input
                id={id}
                type="number"
                min="0"
                step="0.1"
                value={addForm[key]}
                onChange={(e) => setAddForm({ ...addForm, [key]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {fieldError(addErrors, key) && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                  {fieldError(addErrors, key)}
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
        >
          Add food
        </button>
      </div>
    </div>
  );
}

// ── Inline edit row sub-component ─────────────────────────────────────────────

interface EditFoodRowProps {
  form: typeof EMPTY_FORM;
  onChange: (form: typeof EMPTY_FORM) => void;
  errors: ValidationError[];
  fieldError: (field: string) => string;
}

function EditFoodRow({ form, onChange, fieldError }: EditFoodRowProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {fieldError('name') && (
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldError('name')}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Category</label>
          <input
            type="text"
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { key: 'caloriesPer100g', label: 'Kcal/100g' },
            { key: 'proteinPer100g', label: 'Protein' },
            { key: 'carbsPer100g', label: 'Carbs' },
            { key: 'fatPer100g', label: 'Fat' },
          ] as const
        ).map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form[key]}
              onChange={(e) => onChange({ ...form, [key]: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {fieldError(key) && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400" role="alert">
                {fieldError(key)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
