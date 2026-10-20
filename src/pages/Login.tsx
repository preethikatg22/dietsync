// ─────────────────────────────────────────────────────────────────────────────
// Login Page
// Requirements: 2.3, 2.7, 2.8
// ─────────────────────────────────────────────────────────────────────────────
//
// Email + password form with inline validation.
// Displays:
//   - "Local device only. Data does not sync across devices." (Req 2.7)
//   - Password reset unavailable notice (Req 2.8)
// Calls authStore.login; navigates to /dashboard on success (Req 2.2–2.4).

import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.ts';

// ── Helpers ────────────────────────────────────────────────────────────────

function validateEmail(value: string): string {
  if (!value.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return 'Enter a valid email address.';
  return '';
}

function validatePassword(value: string): string {
  if (!value) return 'Password is required.';
  return '';
}

// ── Component ──────────────────────────────────────────────────────────────

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    // Run inline validation before submitting
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setIsLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch {
      // Req 2.3: generic error — do not reveal which field was wrong
      setSubmitError('Email or password is incorrect.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">DietSync</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {/* Local-only notice (Req 2.7) */}
        <div
          role="note"
          className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700"
        >
          Local device only. Data does not sync across devices.
        </div>

        {/* Form card */}
        <div className="bg-white shadow rounded-lg p-8 space-y-5">
          <form onSubmit={handleSubmit} noValidate aria-label="Sign in form">
            {/* Email */}
            <div className="space-y-1 mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(validateEmail(e.target.value));
                }}
                onBlur={() => setEmailError(validateEmail(email))}
                aria-describedby={emailError ? 'email-error' : undefined}
                aria-invalid={!!emailError}
                className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  emailError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
                placeholder="you@example.com"
                disabled={isLoading}
              />
              {emailError && (
                <p id="email-error" role="alert" className="text-xs text-red-600 mt-1">
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1 mb-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(validatePassword(e.target.value));
                }}
                onBlur={() => setPasswordError(validatePassword(password))}
                aria-describedby={passwordError ? 'password-error' : undefined}
                aria-invalid={!!passwordError}
                className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  passwordError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
                disabled={isLoading}
              />
              {passwordError && (
                <p id="password-error" role="alert" className="text-xs text-red-600 mt-1">
                  {passwordError}
                </p>
              )}
            </div>

            {/* Submit error */}
            {submitError && (
              <p role="alert" className="text-sm text-red-600 mb-4">
                {submitError}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
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
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Password reset unavailable notice (Req 2.8) */}
          <p className="text-center text-xs text-gray-500">
            Password reset is not available. Forgotten passwords cannot be
            recovered.
          </p>
        </div>

        {/* Link to onboarding */}
        <p className="text-center text-sm text-gray-600">
          New to DietSync?{' '}
          <Link
            to="/onboarding"
            className="font-medium text-emerald-600 hover:text-emerald-700"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

export default Login;
