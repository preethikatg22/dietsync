// ─────────────────────────────────────────────────────────────────────────────
// Onboarding Page — Multi-step wizard
// Requirements: 1.1–1.7
// ─────────────────────────────────────────────────────────────────────────────
//
// Steps:
//   1 — Profile data (name, email, dob, sex, height, weight, activity, goal)
//   2 — TDEE preview (computed from entered data using NutritionCalculator)
//   3 — Confirmation + disclaimer + password → create account
//
// Inline validation blocks step advancement (Req 1.4).
// Loading spinner shown during PBKDF2 hashing (Req 1.6).
// "Local device only" notice present (Req 2.7).
// Medical disclaimer shown on confirmation step (Req 1.3).

import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.ts';
import { computeBMR, computeTDEE, computeGoalTarget } from '../services/NutritionCalculator.ts';
import type { ActivityLevel, Goal, OnboardingData, Sex } from '../types/index.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step1Fields {
  name: string;
  email: string;
  dob: string;
  sex: Sex | '';
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | '';
  goal: Goal | '';
}

interface Step1Errors {
  name?: string;
  email?: string;
  dob?: string;
  sex?: string;
  heightCm?: string;
  weightKg?: string;
  activityLevel?: string;
  goal?: string;
}

interface Step3Fields {
  password: string;
  confirmPassword: string;
}

interface Step3Errors {
  password?: string;
  confirmPassword?: string;
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateStep1(fields: Step1Fields): Step1Errors {
  const errors: Step1Errors = {};

  if (!fields.name.trim()) {
    errors.name = 'Name is required.';
  } else if (fields.name.trim().length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  if (!fields.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!fields.dob) {
    errors.dob = 'Date of birth is required.';
  } else {
    const dob = new Date(fields.dob);
    const today = new Date();
    if (isNaN(dob.getTime())) {
      errors.dob = 'Enter a valid date.';
    } else if (dob >= today) {
      errors.dob = 'Date of birth must be in the past.';
    }
  }

  if (!fields.sex) {
    errors.sex = 'Biological sex is required.';
  }

  const heightNum = parseFloat(fields.heightCm);
  if (fields.heightCm === '') {
    errors.heightCm = 'Height is required.';
  } else if (isNaN(heightNum) || !isFinite(heightNum)) {
    errors.heightCm = 'Enter a valid number for height.';
  } else if (heightNum < 50 || heightNum > 300) {
    errors.heightCm = 'Height must be between 50 and 300 cm.';
  }

  const weightNum = parseFloat(fields.weightKg);
  if (fields.weightKg === '') {
    errors.weightKg = 'Weight is required.';
  } else if (isNaN(weightNum) || !isFinite(weightNum)) {
    errors.weightKg = 'Enter a valid number for weight.';
  } else if (weightNum < 10 || weightNum > 500) {
    errors.weightKg = 'Weight must be between 10 and 500 kg.';
  }

  if (!fields.activityLevel) {
    errors.activityLevel = 'Activity level is required.';
  }

  if (!fields.goal) {
    errors.goal = 'Goal is required.';
  }

  return errors;
}

function validateStep3(fields: Step3Fields): Step3Errors {
  const errors: Step3Errors = {};
  if (!fields.password) {
    errors.password = 'Password is required.';
  } else if (fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (!fields.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

// ── Helper: compute TDEE from Step1 fields ────────────────────────────────────

function computeTDEEFromFields(
  fields: Step1Fields
): { tdee: number; goalTarget: number } | null {
  if (
    !fields.sex ||
    !fields.dob ||
    !fields.heightCm ||
    !fields.weightKg ||
    !fields.activityLevel ||
    !fields.goal
  )
    return null;

  const heightCm = parseFloat(fields.heightCm);
  const weightKg = parseFloat(fields.weightKg);
  if (isNaN(heightCm) || isNaN(weightKg)) return null;

  try {
    const bmr = computeBMR({
      sex: fields.sex,
      dob: fields.dob,
      heightCm,
      weightKg,
    });
    const tdee = computeTDEE(bmr, fields.activityLevel);
    const goalTarget = computeGoalTarget(tdee, fields.goal);
    return { tdee, goalTarget };
  } catch {
    return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FieldErrorProps {
  id: string;
  message?: string;
}
function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-red-600 mt-1">
      {message}
    </p>
  );
}

interface LabeledInputProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  autoComplete?: string;
  disabled?: boolean;
}
function LabeledInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  min,
  max,
  step,
  autoComplete,
  disabled,
}: LabeledInputProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
        className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'
        }`}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface LabeledSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}
function LabeledSelect({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  children,
}: LabeledSelectProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
        className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'
        }`}
        disabled={disabled}
      >
        {children}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex items-center justify-center"
    >
      <svg
        className="animate-spin h-8 w-8 text-emerald-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ── Progress indicator ────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 < current
              ? 'w-8 bg-emerald-600'
              : i + 1 === current
              ? 'w-8 bg-emerald-600'
              : 'w-8 bg-gray-200'
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function Onboarding() {
  const navigate = useNavigate();
  const createAccount = useAuthStore((s) => s.createAccount);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 1 state
  const [step1, setStep1] = useState<Step1Fields>({
    name: '',
    email: '',
    dob: '',
    sex: '',
    heightCm: '',
    weightKg: '',
    activityLevel: '',
    goal: '',
  });
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});

  // Step 3 state
  const [step3, setStep3] = useState<Step3Fields>({
    password: '',
    confirmPassword: '',
  });
  const [step3Errors, setStep3Errors] = useState<Step3Errors>({});

  // ── Step navigation ─────────────────────────────────────────────────────────

  const handleStep1Next = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors = validateStep1(step1);
    setStep1Errors(errors);
    if (Object.keys(errors).length > 0) return;

    // Compute TDEE; if it fails, show an error and block (Req 1.7)
    const result = computeTDEEFromFields(step1);
    if (!result) {
      setStep1Errors((prev) => ({
        ...prev,
        name: 'Profile data could not be processed. Please review your inputs.',
      }));
      return;
    }

    setStep(2);
  };

  const handleStep3Submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    const errors = validateStep3(step3);
    setStep3Errors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      const profile: OnboardingData = {
        name: step1.name.trim(),
        email: step1.email.trim(),
        dob: step1.dob,
        sex: step1.sex as Sex,
        heightCm: parseFloat(step1.heightCm),
        weightKg: parseFloat(step1.weightKg),
        activityLevel: step1.activityLevel as ActivityLevel,
        goal: step1.goal as Goal,
        password: step3.password,
      };
      await createAccount(profile);
      navigate('/dashboard');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Account creation failed. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── TDEE values for preview ─────────────────────────────────────────────────
  const tdeeResult = computeTDEEFromFields(step1);

  // ── Loading overlay ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4">
          <Spinner label="Creating your account. This may take a moment…" />
          <p className="text-sm text-gray-600">
            Securing your account. Please wait…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">DietSync</h1>
          <p className="mt-1 text-sm text-gray-500">Create your account</p>
        </div>

        {/* Local-only notice (Req 2.7) */}
        <div
          role="note"
          className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700"
        >
          Local device only. Data does not sync across devices.
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} total={3} />

        {/* ── Step 1: Profile data ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-white shadow rounded-lg p-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Your profile
            </h2>
            <form onSubmit={handleStep1Next} noValidate aria-label="Profile information form">
              <div className="grid grid-cols-1 gap-4">
                {/* Name */}
                <LabeledInput
                  id="name"
                  label="Full name"
                  value={step1.name}
                  onChange={(v) => setStep1((p) => ({ ...p, name: v }))}
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      name: validateStep1({ ...step1 }).name,
                    }))
                  }
                  error={step1Errors.name}
                  autoComplete="name"
                />

                {/* Email */}
                <LabeledInput
                  id="email"
                  label="Email address"
                  type="email"
                  value={step1.email}
                  onChange={(v) => setStep1((p) => ({ ...p, email: v }))}
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      email: validateStep1({ ...step1 }).email,
                    }))
                  }
                  error={step1Errors.email}
                  autoComplete="email"
                  placeholder="you@example.com"
                />

                {/* Date of birth */}
                <LabeledInput
                  id="dob"
                  label="Date of birth"
                  type="date"
                  value={step1.dob}
                  onChange={(v) => setStep1((p) => ({ ...p, dob: v }))}
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      dob: validateStep1({ ...step1 }).dob,
                    }))
                  }
                  error={step1Errors.dob}
                  max={new Date().toISOString().slice(0, 10)}
                />

                {/* Biological sex */}
                <LabeledSelect
                  id="sex"
                  label="Biological sex"
                  value={step1.sex}
                  onChange={(v) =>
                    setStep1((p) => ({ ...p, sex: v as Sex | '' }))
                  }
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      sex: validateStep1({ ...step1 }).sex,
                    }))
                  }
                  error={step1Errors.sex}
                >
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </LabeledSelect>

                {/* Height */}
                <LabeledInput
                  id="heightCm"
                  label="Height (cm)"
                  type="number"
                  value={step1.heightCm}
                  onChange={(v) => setStep1((p) => ({ ...p, heightCm: v }))}
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      heightCm: validateStep1({ ...step1 }).heightCm,
                    }))
                  }
                  error={step1Errors.heightCm}
                  min="50"
                  max="300"
                  step="0.1"
                  placeholder="e.g. 170"
                />

                {/* Weight */}
                <LabeledInput
                  id="weightKg"
                  label="Current weight (kg)"
                  type="number"
                  value={step1.weightKg}
                  onChange={(v) => setStep1((p) => ({ ...p, weightKg: v }))}
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      weightKg: validateStep1({ ...step1 }).weightKg,
                    }))
                  }
                  error={step1Errors.weightKg}
                  min="10"
                  max="500"
                  step="0.1"
                  placeholder="e.g. 70"
                />

                {/* Activity level */}
                <LabeledSelect
                  id="activityLevel"
                  label="Activity level"
                  value={step1.activityLevel}
                  onChange={(v) =>
                    setStep1((p) => ({
                      ...p,
                      activityLevel: v as ActivityLevel | '',
                    }))
                  }
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      activityLevel: validateStep1({ ...step1 }).activityLevel,
                    }))
                  }
                  error={step1Errors.activityLevel}
                >
                  <option value="">Select…</option>
                  <option value="sedentary">Sedentary (little or no exercise)</option>
                  <option value="lightly_active">Lightly active (1–3 days/week)</option>
                  <option value="moderately_active">Moderately active (3–5 days/week)</option>
                  <option value="very_active">Very active (6–7 days/week)</option>
                  <option value="extra_active">Extra active (physical job or 2× training)</option>
                </LabeledSelect>

                {/* Goal */}
                <LabeledSelect
                  id="goal"
                  label="Goal"
                  value={step1.goal}
                  onChange={(v) =>
                    setStep1((p) => ({ ...p, goal: v as Goal | '' }))
                  }
                  onBlur={() =>
                    setStep1Errors((p) => ({
                      ...p,
                      goal: validateStep1({ ...step1 }).goal,
                    }))
                  }
                  error={step1Errors.goal}
                >
                  <option value="">Select…</option>
                  <option value="lose">Lose weight</option>
                  <option value="maintain">Maintain weight</option>
                  <option value="gain">Gain weight</option>
                </LabeledSelect>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 2: TDEE preview ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white shadow rounded-lg p-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">
              Your estimated calorie needs
            </h2>

            {tdeeResult ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      TDEE
                    </dt>
                    <dd className="mt-1 text-2xl font-bold text-emerald-600">
                      {Math.round(tdeeResult.tdee)} kcal
                    </dd>
                    <dd className="text-xs text-gray-500">
                      Total Daily Energy Expenditure
                    </dd>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Goal target
                    </dt>
                    <dd className="mt-1 text-2xl font-bold text-emerald-700">
                      {Math.round(tdeeResult.goalTarget)} kcal
                    </dd>
                    <dd className="text-xs text-gray-500 capitalize">
                      {step1.goal === 'lose'
                        ? 'Lose weight (–500 kcal)'
                        : step1.goal === 'gain'
                        ? 'Gain weight (+500 kcal)'
                        : 'Maintain weight'}
                    </dd>
                  </div>
                </dl>

                <p className="text-sm text-gray-600">
                  These values are calculated using the Mifflin-St Jeor formula
                  based on your profile. You can adjust your targets later in
                  Settings.
                </p>
              </div>
            ) : (
              <p className="text-sm text-red-600">
                Unable to compute nutrition targets from the provided data.
                Please go back and review your profile.
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!tdeeResult}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirmation ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-white shadow rounded-lg p-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">
              Create your account
            </h2>

            {/* Medical disclaimer (Req 1.3) */}
            <div
              role="note"
              aria-label="Medical disclaimer"
              className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
            >
              DietSync provides general tracking only and is not medical or
              dietetic advice.
            </div>

            {/* Summary of profile */}
            <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 space-y-1 text-sm text-gray-700">
              <p>
                <span className="font-medium">Name:</span> {step1.name}
              </p>
              <p>
                <span className="font-medium">Email:</span> {step1.email}
              </p>
              <p>
                <span className="font-medium">Goal target:</span>{' '}
                {tdeeResult ? `${Math.round(tdeeResult.goalTarget)} kcal/day` : '—'}
              </p>
            </div>

            <form onSubmit={handleStep3Submit} noValidate aria-label="Create account form">
              <div className="space-y-4">
                {/* Password */}
                <div className="space-y-1">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={step3.password}
                    onChange={(e) =>
                      setStep3((p) => ({ ...p, password: e.target.value }))
                    }
                    onBlur={() =>
                      setStep3Errors((p) => ({
                        ...p,
                        password: validateStep3(step3).password,
                      }))
                    }
                    aria-describedby={
                      step3Errors.password ? 'password-error' : undefined
                    }
                    aria-invalid={!!step3Errors.password}
                    className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      step3Errors.password
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300'
                    }`}
                  />
                  <FieldError
                    id="password-error"
                    message={step3Errors.password}
                  />
                  <p className="text-xs text-gray-500">
                    Minimum 8 characters. Forgotten passwords cannot be
                    recovered.
                  </p>
                </div>

                {/* Confirm password */}
                <div className="space-y-1">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={step3.confirmPassword}
                    onChange={(e) =>
                      setStep3((p) => ({
                        ...p,
                        confirmPassword: e.target.value,
                      }))
                    }
                    onBlur={() =>
                      setStep3Errors((p) => ({
                        ...p,
                        confirmPassword: validateStep3(step3).confirmPassword,
                      }))
                    }
                    aria-describedby={
                      step3Errors.confirmPassword
                        ? 'confirmPassword-error'
                        : undefined
                    }
                    aria-invalid={!!step3Errors.confirmPassword}
                    className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      step3Errors.confirmPassword
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300'
                    }`}
                  />
                  <FieldError
                    id="confirmPassword-error"
                    message={step3Errors.confirmPassword}
                  />
                </div>
              </div>

              {/* Submit error */}
              {submitError && (
                <p role="alert" className="text-sm text-red-600 mt-4">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                >
                  Create account
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Link back to login */}
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-emerald-600 hover:text-emerald-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default Onboarding;
