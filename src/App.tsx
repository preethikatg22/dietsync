// ─────────────────────────────────────────────────────────────────────────────
// App — root component with BrowserRouter, all routes, and bottom nav
// Requirements: 2.4, 2.5
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from 'react-router-dom';
import { Login, Onboarding, Dashboard, Log, Progress, Settings } from './pages/index.ts';
import { useAuthStore } from './stores/authStore.ts';

// ── Private route guard (Req 2.4, 2.5) ────────────────────────────────────────

/**
 * Wraps a route that requires authentication.
 * Redirects to /login if there is no active session.
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Bottom navigation bar ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Home',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
        <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
        <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
      </svg>
    ),
  },
  {
    to: '/log',
    label: 'Log',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    to: '/progress',
    label: 'Progress',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
        <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 0 1-1.875-1.875V8.625ZM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 19.875v-6.75Z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
] as const;

/**
 * Bottom navigation bar — only shown on authenticated routes.
 * Highlights the active tab with an emerald accent.
 */
function BottomNav() {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  // Hide on auth pages
  const authPaths = ['/login', '/onboarding'];
  if (!session || authPaths.includes(location.pathname)) return null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 inset-x-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-bottom"
    >
      <ul className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg transition-colors w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`
              }
              aria-label={label}
            >
              {icon}
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Smart root redirect (Req 2.4, 2.5) ────────────────────────────────────────

/**
 * Redirects / to /dashboard for logged-in users, /login otherwise.
 */
function RootRedirect() {
  const session = useAuthStore((s) => s.session);
  return <Navigate to={session ? '/dashboard' : '/login'} replace />;
}

// ── App shell ─────────────────────────────────────────────────────────────────

function AppShell() {
  const validateSession = useAuthStore((s) => s.validateSession);

  // Validate persisted session on every app load (Req 2.5)
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  return (
    <>
      <Routes>
        {/* ── Public routes ─────────────────────────────────────────────── */}
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* ── Authenticated routes ──────────────────────────────────────── */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              {/* Extra bottom padding so content isn't hidden behind the nav bar */}
              <div className="pb-16">
                <Dashboard />
              </div>
            </PrivateRoute>
          }
        />
        <Route
          path="/log"
          element={
            <PrivateRoute>
              <div className="pb-16">
                <Log />
              </div>
            </PrivateRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <PrivateRoute>
              <div className="pb-16">
                <Progress />
              </div>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <div className="pb-16">
                <Settings />
              </div>
            </PrivateRoute>
          }
        />

        {/* ── Redirects ─────────────────────────────────────────────────── */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      {/* Bottom nav sits outside Routes so it persists across navigations */}
      <BottomNav />
    </>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
