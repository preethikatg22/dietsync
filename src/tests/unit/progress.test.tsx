/**
 * Unit tests for the Progress page and its sub-components.
 *
 * Uses @testing-library/react with real Zustand stores. State is reset and
 * localStorage is cleared between tests.
 *
 * Validates:
 *  - Req 9.3, 9.4, 9.6 — Streak badge correct count / zero state
 *  - Req 8.3            — Weight chart requires ≥ 2 entries
 *  - Req 9.5, 9.8       — Weekly chart empty state when daysLogged === 0
 *  - Req 9.1            — Weekly chart renders when daysLogged > 0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Progress } from '../../pages/Progress.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import { useProgressStore } from '../../stores/progressStore.ts';
import type { DailyAdherence, WeightEntry, WeeklyStats } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the Progress page inside a minimal MemoryRouter. */
function renderProgress() {
  return render(
    <MemoryRouter initialEntries={['/progress']}>
      <Routes>
        <Route path="/progress" element={<Progress />} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/settings" element={<div>Settings</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Reset auth + progress store slices to their initial state. */
function resetStores() {
  useAuthStore.setState({ session: null, currentUser: null });
  useProgressStore.setState({
    streak: 0,
    weeklyStats: null,
    monthlyStats: [],
    weightLog: [],
  });
}

/** A WeeklyStats fixture with `daysLogged === 0` (empty week). */
const EMPTY_WEEKLY_STATS: WeeklyStats = {
  weekOf: '2025-01-06',
  averageCalories: 0,
  daysLogged: 0,
  targetCalories: 2000,
};

/** A WeeklyStats fixture with `daysLogged > 0` (active week). */
const ACTIVE_WEEKLY_STATS: WeeklyStats = {
  weekOf: '2025-01-06',
  averageCalories: 1800,
  daysLogged: 3,
  targetCalories: 2000,
};

/** A minimal DailyAdherence array (just the Mon of that week). */
const SAMPLE_MONTHLY_STATS: DailyAdherence[] = [
  { date: '2025-01-06', adherencePct: 90 },
  { date: '2025-01-07', adherencePct: 85 },
  { date: '2025-01-08', adherencePct: 95 },
];

/** Two weight entries — enough to render the chart. */
const TWO_WEIGHT_ENTRIES: WeightEntry[] = [
  { date: '2025-01-01', weightKg: 80 },
  { date: '2025-01-08', weightKg: 79.5 },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// Streak badge tests (Req 9.3, 9.4, 9.6)
// ---------------------------------------------------------------------------

describe('Streak badge — correct count (Req 9.3, 9.4)', () => {
  /**
   * When progressStore.streak is a positive number N, the badge should
   * prominently display N and show "day streak".
   */
  it('shows correct streak count when streak > 0', () => {
    act(() => {
      useProgressStore.setState({ streak: 7 });
    });

    renderProgress();

    // The numeric count must be visible
    expect(screen.getByText('7')).toBeInTheDocument();
    // "day streak" label
    expect(screen.getByText(/day streak/i)).toBeInTheDocument();
    // The role="status" element has the right aria-label
    expect(screen.getByRole('status', { name: /7-day streak/i })).toBeInTheDocument();
  });

  it('shows streak count of 1 correctly', () => {
    act(() => {
      useProgressStore.setState({ streak: 1 });
    });

    renderProgress();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /1-day streak/i })).toBeInTheDocument();
  });

  it('shows streak count of 30 correctly', () => {
    act(() => {
      useProgressStore.setState({ streak: 30 });
    });

    renderProgress();

    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /30-day streak/i })).toBeInTheDocument();
  });
});

describe('Streak badge — zero / no streak (Req 9.6)', () => {
  /**
   * When streak is 0, the badge should show "No streak yet" rather than "0"
   * (Req 9.6 — streak of 0 shown clearly, not as a confusing "0-day streak").
   */
  it('shows "No streak yet" when streak is 0', () => {
    act(() => {
      useProgressStore.setState({ streak: 0 });
    });

    renderProgress();

    expect(screen.getByText(/no streak yet/i)).toBeInTheDocument();
    // The status element aria-label should indicate no streak
    expect(screen.getByRole('status', { name: /no streak yet/i })).toBeInTheDocument();
  });

  it('does not show a numeric "0" streak count', () => {
    act(() => {
      useProgressStore.setState({ streak: 0 });
    });

    renderProgress();

    // "0-day streak" should NOT appear
    expect(screen.queryByText(/0-day streak/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Weight chart — ≥ 2 entries gate (Req 8.3)
// ---------------------------------------------------------------------------

describe('Weight chart — minimum 2 entries required (Req 8.3)', () => {
  /**
   * With 0 weight entries the chart cannot be rendered — the component must
   * show "Add at least 2 weight entries to see your trend."
   */
  it('shows "Add at least 2 weight entries" message when weightLog is empty', () => {
    act(() => {
      useProgressStore.setState({ weightLog: [] });
    });

    renderProgress();

    expect(
      screen.getByText(/add at least 2 weight entries to see your trend/i),
    ).toBeInTheDocument();
  });

  /**
   * With exactly 1 entry the placeholder message is still shown.
   */
  it('shows the placeholder message when weightLog has only 1 entry', () => {
    act(() => {
      useProgressStore.setState({
        weightLog: [{ date: '2025-01-01', weightKg: 80 }],
      });
    });

    renderProgress();

    expect(
      screen.getByText(/add at least 2 weight entries to see your trend/i),
    ).toBeInTheDocument();
  });

  /**
   * With 2 or more entries the chart container is rendered and the placeholder
   * message is NOT shown.
   */
  it('renders the weight chart when weightLog has ≥ 2 entries', () => {
    act(() => {
      useProgressStore.setState({ weightLog: TWO_WEIGHT_ENTRIES });
    });

    renderProgress();

    // Placeholder must be gone
    expect(
      screen.queryByText(/add at least 2 weight entries to see your trend/i),
    ).not.toBeInTheDocument();

    // The Weight Trend heading is present, confirming the chart section rendered
    expect(screen.getByText(/weight trend/i)).toBeInTheDocument();
    // The aria-labelled chart container must be present
    expect(screen.getByRole('img', { name: /weight trend chart/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Weekly chart — empty state (Req 9.5, 9.8)
// ---------------------------------------------------------------------------

describe('Weekly chart — empty state when no logs (Req 9.5, 9.8)', () => {
  /**
   * When weeklyStats.daysLogged === 0, the WeeklyChart must display
   * "No data logged for this week." instead of the bar chart.
   */
  it('shows "No data logged for this week." when daysLogged is 0', () => {
    act(() => {
      useProgressStore.setState({ weeklyStats: EMPTY_WEEKLY_STATS, monthlyStats: [] });
    });

    renderProgress();

    expect(screen.getByText(/no data logged for this week\./i)).toBeInTheDocument();
  });

  /**
   * When weeklyStats is null (not yet loaded), the same empty state is shown.
   */
  it('shows empty state when weeklyStats is null', () => {
    act(() => {
      useProgressStore.setState({ weeklyStats: null, monthlyStats: [] });
    });

    renderProgress();

    expect(screen.getByText(/no data logged for this week\./i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Weekly chart — renders chart data when daysLogged > 0 (Req 9.1)
// ---------------------------------------------------------------------------

describe('Weekly chart — renders when daysLogged > 0 (Req 9.1)', () => {
  /**
   * When weeklyStats.daysLogged > 0, the bar chart container should be
   * rendered (aria-labelled img role) and the empty-state message absent.
   */
  it('renders the weekly bar chart when daysLogged > 0', () => {
    act(() => {
      useProgressStore.setState({
        weeklyStats: ACTIVE_WEEKLY_STATS,
        monthlyStats: SAMPLE_MONTHLY_STATS,
      });
    });

    renderProgress();

    // Empty-state must NOT be shown
    expect(screen.queryByText(/no data logged for this week\./i)).not.toBeInTheDocument();

    // The chart's aria-labelled container is rendered
    expect(screen.getByRole('img', { name: /weekly calorie adherence chart/i })).toBeInTheDocument();
  });

  it('shows days logged count in weekly chart header', () => {
    act(() => {
      useProgressStore.setState({
        weeklyStats: ACTIVE_WEEKLY_STATS,
        monthlyStats: SAMPLE_MONTHLY_STATS,
      });
    });

    renderProgress();

    // "3 days logged this week"
    expect(screen.getByText(/3 days logged this week/i)).toBeInTheDocument();
  });

  it('shows average and target calories in weekly chart header', () => {
    act(() => {
      useProgressStore.setState({
        weeklyStats: ACTIVE_WEEKLY_STATS,
        monthlyStats: SAMPLE_MONTHLY_STATS,
      });
    });

    renderProgress();

    // "Avg 1800 kcal / 2000 target" (rounded)
    expect(screen.getByText(/avg 1800 kcal \/ 2000 target/i)).toBeInTheDocument();
  });
});
