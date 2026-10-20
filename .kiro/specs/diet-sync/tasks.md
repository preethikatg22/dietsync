# Implementation Plan: DietSync

## Overview

DietSync is a frontend-only PWA built with React 18 + Vite + TypeScript. Tasks are ordered so that each step can be committed and verified independently. Property-based tests (fast-check) are placed immediately after the unit under test so regressions are caught early. Stretch features S1-S4 are marked optional (`*`) and can be skipped for an MVP build.

---

## Tasks

- [x] 1. Scaffold the project and configure tooling
  - [x] 1.1 Initialise a Vite + React + TypeScript project at the workspace root
    - Run `npm create vite@latest . -- --template react-ts` (or equivalent) and accept all prompts
    - Verify `vite.config.ts`, `tsconfig.json` (strict mode), and `src/main.tsx` are created
    - _Requirements: 10.1, 10.2_
  - [x] 1.2 Install and configure Tailwind CSS
    - Install `tailwindcss`, `postcss`, `autoprefixer`; run `npx tailwindcss init -p`
    - Add `content` globs for `./src/**/*.{ts,tsx}` in `tailwind.config.js`
    - Import Tailwind directives in `src/index.css`
    - _Requirements: (UI foundation for all pages)_
  - [x] 1.3 Install Zustand, Recharts, and Zod
    - `npm install zustand recharts zod`
    - Confirm TypeScript picks up types for each package
    - _Requirements: 6.1-6.6, 8.3, 9.1-9.2_
  - [x] 1.4 Install and configure vite-plugin-pwa
    - `npm install -D vite-plugin-pwa`
    - Add plugin to `vite.config.ts` with `generateSW` strategy; configure `registerType: 'autoUpdate'`
    - _Requirements: 10.1-10.4_
  - [x] 1.5 Install Vitest and fast-check
    - `npm install -D vitest @vitest/coverage-v8 fast-check`
    - Add `test` section to `vite.config.ts`: `globals: true`, `environment: 'jsdom'`
    - Create `src/tests/unit/` and `src/tests/property/` directories
    - _Requirements: 17-31 (all PBT requirements)_
  - [x] 1.6 Create the base directory structure
    - Create empty index files in `src/repositories/`, `src/services/`, `src/stores/`, `src/components/`, `src/pages/`, `src/hooks/`, `src/types/`, `src/data/`
    - Verify the layout matches the design's Directory Layout section
    - _Requirements: (all)_

- [x] 2. Define TypeScript types and data models
  - [x] 2.1 Create `src/types/index.ts` with all shared types
    - Define `Sex`, `ActivityLevel`, `Goal`, `MealSection` union types
    - Define `FoodItem`, `CustomFood`, `LogEntry`, `DayLog`, `UserProfile`, `NutritionGoals`, `UserSettings`, `Session`, `WeightEntry` interfaces
    - Define `AuthRecord`, `WeeklyStats`, `DailyAdherence`, `DayTotals`, `ScaledNutrients` types
    - _Requirements: (all data model types)_
  - [x] 2.2 Define `STORAGE_KEYS` constants object
    - Export a single `STORAGE_KEYS` object with all `dietsync:*` key templates
    - _Requirements: 11.5_
  - [x] 2.3 Create `src/data/foods.json` with seed data
    - Add 300–400 food items with `id`, `name`, `category`, `caloriesPer100g`, `proteinPer100g`, `carbsPer100g`, `fatPer100g`, `source`
    - Include categories: grains, dairy, proteins, fruits, vegetables, snacks, indian_staples
    - Add top-level `version: "1.0.0"` field
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 3. Implement `StorageRepository`
  - [x] 3.1 Create `src/repositories/StorageRepository.ts`
    - Implement `get<T>(key, schema, fallback)`: parse JSON, validate with Zod, return fallback on any failure without throwing
    - Implement `set<T>(key, value)`: serialise to JSON, catch `QuotaExceededError` and log warning
    - Implement `remove(key)`: no-op if key absent
    - Implement `estimatedUsageBytes()`: sum byte lengths of all `dietsync:*` keys and values
    - _Requirements: 11.1, 11.2, 11.4, 11.5_
  - [x] 3.2 Write property-based tests for `StorageRepository`
    - Test round-trip serialisation preserves deep equality for all stored types (Property 20)
    - Test invalid JSON returns safe default without throwing (Property 20)
    - Test pruning removes only entries older than threshold (Property 21)
    - _Requirements: 30.1-30.5_

- [x] 4. Implement `IFoodRepository` and `LocalFoodRepository`
  - [x] 4.1 Create `src/repositories/IFoodRepository.ts`
    - Define `IFoodRepository` interface with `search`, `getById`, `getCategories`
    - Define `FoodRepositoryError` type `{ error: true; message: string; id: string }`
    - _Requirements: 3.3, 3.6_
  - [x] 4.2 Create `src/repositories/LocalFoodRepository.ts`
    - Load `foods.json` at module initialisation
    - `search(query)`: case-insensitive substring match on `name` and `category`; merge custom foods at query time
    - `getById(id)`: check bundled then custom; return `FoodRepositoryError` (never null) if not found
    - `getCategories()`: union of all `category` values, de-duplicated and sorted
    - Custom food IDs use `"custom_"` + UUID v4 prefix
    - _Requirements: 3.3, 3.4, 3.6, 3.7, 4.6_
  - [x] 4.3 Write property-based tests for `LocalFoodRepository`
    - Test no false positives in search results (Property 13)
    - Test custom food IDs never collide with bundled IDs (Property 14)
    - Test mutations (edit/delete) are immediately reflected in subsequent queries (Property 15)
    - _Requirements: 23.1-23.4_

- [x] 5. Implement `NutritionCalculator`
  - [x] 5.1 Create `src/services/NutritionCalculator.ts` with all pure functions
    - `computeBMR`: Mifflin-St Jeor formula for male and female
    - `computeTDEE`: BMR × activity multiplier
    - `computeGoalTarget`: TDEE ± 500 based on goal
    - `scaleNutrients`: `(per100g × servingGrams) / 100` for all four nutrients
    - `aggregateDayLog`: sum all entry values regardless of order
    - `computeRemaining`: `target - consumed` (unclamped)
    - `computeProgressPct`: `(consumed / target) × 100`; return 0 when target = 0
    - `checkCalorieFloor`: returns true if below 1200 (female) or 1500 (male)
    - `sortWeightLog`: stable ascending date sort
    - `computeWeeklyAverage`: Mon–Sun boundary, exclude days with no entries from divisor
    - `computeMonthlyAdherence`: per-day `consumed / target × 100` for month
    - `computeStreak`: consecutive logged days ending today/yesterday
    - _Requirements: 1.2, 6.6, 7.1, 7.7, 7.8, 8.4, 9.3-9.6, 12.1-12.3_
  - [x] 5.2 Write property-based tests for `NutritionCalculator`
    - TDEE ≥ BMR for all valid inputs (Property 1)
    - TDEE monotonically non-decreasing with activity level (Property 2)
    - lose < maintain < gain for all valid TDEE values (Property 3)
    - Macro percentages sum to 100 (Property 4)
    - Calorie floor triggered for all sub-floor inputs (Property 5)
    - Zero serving yields zero nutrients (Property 8)
    - Nutrient scaling is linear / 2S = 2× S (Property 9)
    - Daily totals are order-independent (Property 10)
    - Calorie–macro consistency within 2 kcal per entry (Property 11)
    - Remaining is unclamped; progress ≥ 100% when over target (Property 12)
    - Weekly average respects Mon–Sun boundary (Property 16)
    - Perfect adherence day = 100% (Property 17)
    - Streak increments and resets correctly (Property 18)
    - Weight log is insertion-order independent (Property 19)
    - _Requirements: 17.1-17.6, 19.1-19.3, 20.1-20.3, 21.1-21.2, 22.1-22.3, 24.1-24.3, 25.1-25.3, 26.1-26.3_

- [x] 6. Implement `AuthService`
  - [x] 6.1 Create `src/services/AuthService.ts`
    - `createAccount`: generate userId (UUID v4), hash password with PBKDF2 (SHA-256, 100k iterations, 16-byte random salt), persist to `dietsync:auth` and `dietsync:users`
    - `login`: hash supplied password with stored salt, compare; create 30-day Session on success; return generic error on mismatch
    - `logout`: remove `dietsync:session`
    - `deleteAccount`: remove all `dietsync:[userId]:*` keys and auth entry; leave other users untouched
    - `validateSession`: return Session if present and not expired; remove and return null if expired
    - _Requirements: 1.5, 2.1-2.9_
  - [x] 6.2 Write property-based tests for `AuthService`
    - PBKDF2 is deterministic: same password + salt → same hash (Property 25)
    - Different salts → different hashes (Property 25)
    - Wrong password always rejected (Property 25)
    - Credential/data operations on U1 do not affect U2 (Property 26)
    - Deleting U1 leaves U2 keys intact (Property 26)
    - _Requirements: 29.1-29.4, 31.1-31.3_

- [x] 7. Implement `FoodLogService` and validation layer
  - [x] 7.1 Create `src/services/FoodLogService.ts`
    - `addEntry(userId, date, foodId, grams, section)`: fetch food from repository, scale nutrients, build `LogEntry` with UUID id, load existing DayLog, append, persist
    - `editEntry(userId, date, entryId, grams)`: recalculate nutrients for updated grams, update entry, persist
    - `removeEntry(userId, date, entryId)`: remove entry from DayLog, persist
    - `getDayLog(userId, date)`: load and return DayLog
    - Implement log pruning: remove entries older than configured threshold on load
    - _Requirements: 5.1-5.8, 11.3_
  - [x] 7.2 Create validation helpers in `src/services/FoodLogService.ts`
    - Validate serving size > 0 (Property 7)
    - Validate all required food fields are present and non-negative (Property 6)
    - Return typed `ValidationError[]` with `message` and `field`; empty array on valid input
    - _Requirements: 4.1, 4.2, 5.2, 18.1-18.4_

- [x] 8. Implement `ProgressService` and `ExportService`
  - [x] 8.1 Create `src/services/ProgressService.ts`
    - Wrap `NutritionCalculator` functions with data-loading from `StorageRepository`
    - Expose `getWeeklyStats`, `getMonthlyAdherence`, `getStreak`, `getWeightLog`, `addWeightEntry`
    - _Requirements: 8.1-8.4, 9.1-9.8_
  - [x] 8.2 Create `src/services/ExportService.ts` *(S1 — optional)*
    - Render progress summary card ≥ 600×400 px on Canvas API
    - Toggle visibility of name, weight, calorie stats, streak
    - Trigger file download as PNG; attempt fallback export method if primary unavailable
    - _Requirements: 13.1-13.4_

- [x] 9. Implement Zustand stores
  - [x] 9.1 Create `src/stores/authStore.ts`
    - Slices: `currentUser`, `session`
    - Actions: `login`, `logout`, `createAccount`, `deleteAccount`, `validateSession`
    - Call `AuthService`; update slice on result
    - _Requirements: 2.1-2.9_
  - [x] 9.2 Create `src/stores/logStore.ts`
    - Slices: `activeDate`, `dayLog`
    - Actions: `addEntry`, `editEntry`, `removeEntry`, `setDate`, `loadDayLog`
    - Call `FoodLogService`; update `dayLog` slice
    - _Requirements: 5.1-5.8_
  - [x] 9.3 Create `src/stores/foodStore.ts`
    - Slices: `searchResults`, `customFoods`
    - Actions: `search`, `addCustomFood`, `editCustomFood`, `deleteCustomFood`
    - Call `LocalFoodRepository`; update slices
    - _Requirements: 3.3-3.7, 4.1-4.7_
  - [x] 9.4 Create `src/stores/progressStore.ts`
    - Slices: `streak`, `weeklyStats`, `monthlyStats`, `weightLog`
    - Actions: `refresh`, `addWeightEntry`
    - Call `ProgressService`; update slices
    - _Requirements: 8.1-8.4, 9.1-9.8_

- [x] 10. Implement Login and Onboarding pages
  - [x] 10.1 Create `src/pages/Login.tsx`
    - Email + password form with inline validation
    - Display "Local device only. Data does not sync across devices." notice
    - Display password-reset unavailable notice
    - Call `authStore.login`; navigate to Dashboard on success
    - _Requirements: 2.3, 2.7, 2.8_
  - [x] 10.2 Create `src/pages/Onboarding.tsx`
    - Multi-step wizard: profile data → TDEE preview → confirmation
    - Collect all required fields from Requirement 1.1; validate each with inline errors before advancing
    - Show TDEE preview computed from entered data
    - Show disclaimer: "DietSync provides general tracking only and is not medical or dietetic advice."
    - Show loading spinner while PBKDF2 hashing runs
    - Call `authStore.createAccount`; navigate to Dashboard on success
    - _Requirements: 1.1-1.7_
  - [x] 10.3 Write unit tests for Onboarding and Login
    - Field validation errors block step progression
    - Loading spinner appears during hashing
    - Disclaimer text is present on confirmation step
    - _Requirements: (unit test file: onboarding.test.ts, integration.auth.test.ts)_

- [x] 11. Implement Dashboard page
  - [x] 11.1 Create `src/pages/Dashboard.tsx` and components in `src/components/dashboard/`
    - Display total calories consumed vs target with progress bar
    - Display macro ring chart (Recharts PieChart) showing protein/carbs/fat consumed grams and percentages
    - Display meal-by-meal breakdown with per-section totals
    - Display remaining calories (negative when over-target, visually distinct style)
    - Show prompt to configure goals when no goals are set
    - Subscribe to `logStore` and `authStore`; re-render on log change without page reload
    - _Requirements: 6.1-6.7_
  - [x] 11.2 Write unit tests for Dashboard
    - Remaining calories shown as negative when over target
    - Dashboard re-renders when log changes
    - Prompt shown when no goals configured
    - _Requirements: (unit test file: dashboard.test.ts)_

- [x] 12. Implement Food Log page
  - [x] 12.1 Create `src/pages/Log.tsx` and components in `src/components/food-log/`
    - Date navigator (previous/next day buttons)
    - Four meal section tabs (Breakfast, Lunch, Dinner, Snacks)
    - Entry list per section with edit and remove controls
    - Food search modal: text input → calls `foodStore.search` → shows results with serving size input → calls `logStore.addEntry`
    - Edit entry: update serving size → recalculate macros
    - _Requirements: 5.1-5.8_
  - [x] 12.2 Write unit tests for Food Search Modal and Log page
    - Search results only contain items matching query substring
    - Adding entry updates day totals
    - Editing serving size recalculates nutrients
    - _Requirements: (unit test file: foodLog.test.tsx)_

- [x] 13. Implement Progress page
  - [x] 13.1 Create `src/pages/Progress.tsx` and components in `src/components/progress/`
    - Weekly calorie adherence bar chart (Recharts BarChart); days with no entries show 0%
    - Monthly adherence chart (per-day percentage)
    - Streak badge showing current consecutive-day count
    - Weight trend line chart (Recharts LineChart); require ≥ 2 entries before rendering
    - Empty-state message when queried week has no logged days
    - _Requirements: 8.3, 9.1-9.8_
  - [x] 13.2 Write unit tests for Progress page
    - Streak badge shows correct count
    - Weight chart requires ≥ 2 entries
    - Empty state shown when no logs for the week
    - _Requirements: (unit test file: progress.test.ts)_

- [x] 14. Implement Settings page
  - [x] 14.1 Create `src/pages/Settings.tsx` and components in `src/components/settings/`
    - Nutrition goals editor: calorie target + macro percentage split (must sum to 100; show error otherwise)
    - Show calorie floor warning for < 1200 kcal (female) or < 1500 kcal (male) before saving; allow user to proceed
    - Custom foods manager: list, add, edit, delete with validation
    - Account management: logout button, delete account button (confirm before executing)
    - Log pruning threshold selector (default 90 days)
    - Storage usage indicator; non-blocking warning when > 4 MB
    - _Requirements: 2.6, 2.9, 4.1-4.7, 7.1-7.8, 11.3-11.5_
  - [x] 14.2 Write unit tests for Settings page
    - Macro percentages not summing to 100 blocks save
    - Calorie floor warning shown but user can proceed
    - Delete account removes only that user's data
    - _Requirements: (unit test file: storageWarning.test.ts)_

- [x] 15. Configure routing and App shell
  - [x] 15.1 Install and configure React Router
    - `npm install react-router-dom`
    - Define routes: `/login`, `/onboarding`, `/dashboard`, `/log`, `/progress`, `/settings`
    - Implement `PrivateRoute` guard: redirect to `/login` if no valid session
    - Implement session validation on app load via `authStore.validateSession`
    - _Requirements: 2.4, 2.5_
  - [x] 15.2 Update `src/App.tsx` with router and layout
    - Wrap routes with `<BrowserRouter>`
    - Add bottom navigation bar for authenticated routes
    - _Requirements: (navigation for all pages)_

- [x] 16. Configure PWA manifest and service worker
  - [x] 16.1 Create / update `public/manifest.webmanifest`
    - Add `name`, `short_name`, icons (192×192 and 512×512 px), `theme_color`, `background_color`, `display: standalone`
    - _Requirements: 10.1_
  - [x] 16.2 Finalise `vite-plugin-pwa` configuration
    - Pre-cache app shell and `foods.json`
    - Use versioned cache key for `foods.json` tied to its `version` field
    - Handle service worker registration failure gracefully (console warning, no crash)
    - _Requirements: 10.2-10.5_
  - [x] 16.3 Write unit tests for manifest and service worker
    - Manifest contains required fields
    - SW registration failure does not crash the app
    - _Requirements: (unit test file: manifest.test.ts)_

- [x] 17. Validate `foods.json` and data integrity
  - [x] 17.1 Write unit tests for `foods.json`
    - Item count is 300–400
    - All items have required fields with valid types and non-negative numeric values
    - All category values are from the allowed set
    - No duplicate IDs
    - _Requirements: 3.1, 3.2, (unit test file: foodsJson.test.ts)_

- [x] 18. Integration tests
  - [x] 18.1 Write `integration.onboarding.test.ts`
    - Full onboarding flow creates account, stores hashed password, sets TDEE-based goals
    - _Requirements: 1.1-1.7_
  - [x] 18.2 Write `integration.auth.test.ts`
    - Login succeeds with correct credentials; fails with wrong password
    - Expired session redirects to login
    - Logout clears session
    - _Requirements: 2.2-2.6_
  - [x] 18.3 Write `integration.foodlog.test.ts`
    - Add entry → dashboard totals update
    - Edit entry → recalculated totals stored
    - Remove entry → totals decrease
    - _Requirements: 5.4, 5.5, 6.5_

- [x] 19. Stretch S1 — Progress Export Card *(optional)*
  - [x] 19.1 Implement `ExportService` (see task 8.2)
  - [x] 19.2 Add Export button to Progress page
  - [x] 19.3 Write unit tests for `ExportService`
    - Canvas renders card ≥ 600×400 px
    - Fallback triggered when primary method unavailable
    - _Requirements: 13.1-13.4, (unit test file: exportService.test.ts)_

- [x] 20. Stretch S2 — Water Tracking *(optional)*
  - [x] 20.1 Create `src/services/WaterService.ts`
    - Persist daily totals under `dietsync:[userId]:water`; accumulate additions
    - New day starts at 0; previous day's total preserved
    - _Requirements: 14.1-14.5_
  - [x] 20.2 Add water tracking UI to Dashboard or dedicated section
    - Configurable step (50–1000 ml) and target; display consumed vs target
    - _Requirements: 14.1, 14.2_
  - [x] 20.3 Write property-based tests for `WaterService`
    - N additions sum to arithmetic total (Property 22)
    - Totals for distinct dates are independent (Property 22)
    - _Requirements: 27.1, 27.2_

- [x] 21. Stretch S3 — Recent Foods *(optional)*
  - [x] 21.1 Implement recent foods logic in `FoodLogService`
    - Maintain list of last 10 unique food IDs; promote on re-log; evict oldest when full
    - _Requirements: 15.1-15.4_
  - [x] 21.2 Display recent foods section in Food Search Modal
  - [x] 21.3 Write property-based tests for recent foods
    - List never exceeds 10 entries; no duplicate IDs; promotion to top on re-log (Property 23)
    - _Requirements: 28.1, 28.2_

- [x] 22. Stretch S4 — Copy Yesterday *(optional)*
  - [x] 22.1 Implement copy-yesterday in `FoodLogService`
    - Deep copy all entries from previous day with new UUIDs; do not mutate source log
    - Show informational message if previous day has no log
    - Prompt to append or replace if today already has entries
    - _Requirements: 16.1-16.4_
  - [x] 22.2 Add Copy Yesterday button to Log page
  - [x] 22.3 Write property-based tests for copy-yesterday
    - Copied entries are field-equal to source; mutating today does not alter source (Property 24)
    - _Requirements: 28.3, 28.4_

---

## Notes

- Tasks marked `[x]` are complete; tasks marked `[ ]` are pending.
- Stretch features S1–S4 (tasks 19–22) are optional and can be deferred after the MVP is functional.
- Property-based tests (fast-check) should be written immediately after each unit under test.
- All tasks assume a frontend-only architecture — no backend or server-side code is required.
- Integration tests (task 18) should run against the real store/service stack without mocking storage.

---

## Task Dependency Graph

```
1. Scaffold & tooling                         (no dependencies)
2. TypeScript types & data models             (depends on 1)
3. StorageRepository                          (depends on 2)
4. IFoodRepository + LocalFoodRepository      (depends on 2, 3)
5. NutritionCalculator                        (depends on 2)
6. AuthService                                (depends on 2, 3)
7. FoodLogService + validation                (depends on 2, 3, 4, 5)
8. ProgressService + ExportService            (depends on 2, 3, 5)
9. Zustand stores                             (depends on 5, 6, 7, 8)
10. Login + Onboarding pages                  (depends on 9)
11. Dashboard page                            (depends on 9)
12. Food Log page                             (depends on 9)
13. Progress page                             (depends on 9)
14. Settings page                             (depends on 9)
15. Routing + App shell                       (depends on 10, 11, 12, 13, 14)
16. PWA manifest + service worker             (depends on 1, 15)
17. foods.json data integrity tests           (depends on 2)
18. Integration tests                         (depends on 10, 11, 12)
19. Stretch S1 — Export Card                  (depends on 8, 13)
20. Stretch S2 — Water Tracking               (depends on 3, 9, 11)
21. Stretch S3 — Recent Foods                 (depends on 7, 12)
22. Stretch S4 — Copy Yesterday               (depends on 7, 12)
```

Critical path for MVP: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16
