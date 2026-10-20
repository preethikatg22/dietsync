# Design Document: DietSync

## Overview

DietSync is a frontend-only Progressive Web App (PWA) that enables users to log daily food intake, track nutrition against personalised TDEE-based goals, and monitor weight progress. The application runs entirely in the browser with no backend server or external data transmission. All persisted data lives in the device's LocalStorage, namespaced per user account.

### Key Design Goals

- **Offline-first**: The full application shell and food database are served from a service-worker cache.
- **Privacy by design**: No data leaves the device. Multiple accounts maintain strictly isolated data namespaces.
- **Testability**: Business logic is implemented as pure functions, fully unit- and property-testable without mocking.
- **Type safety**: TypeScript strict mode throughout, with Zod schema validation at every LocalStorage read boundary.

### Technology Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| State management | Zustand |
| Charts | Recharts |
| PWA | vite-plugin-pwa (Workbox generateSW) |
| Password hashing | Web Crypto API — PBKDF2 / SHA-256 |
| Export card | Canvas API |
| Testing | Vitest + fast-check |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Pages  (Login, Onboarding, Dashboard, Log,          │
│          Progress, Settings)                         │
├─────────────────────────────────────────────────────┤
│  Components  (per-feature subtrees)                  │
├─────────────────────────────────────────────────────┤
│  Stores (Zustand)  authStore | logStore | foodStore  │
│                    progressStore                     │
├─────────────────────────────────────────────────────┤
│  Services  AuthService | FoodLogService              │
│            NutritionCalculator | ProgressService     │
│            ExportService                             │
├─────────────────────────────────────────────────────┤
│  Repositories  LocalFoodRepository | StorageRepo     │
├─────────────────────────────────────────────────────┤
│  Data  src/data/foods.json (bundled, versioned)      │
│        LocalStorage (runtime)                        │
└─────────────────────────────────────────────────────┘
```

### Directory Layout

```
src/
├── data/
│   └── foods.json
├── repositories/
│   ├── IFoodRepository.ts
│   ├── LocalFoodRepository.ts
│   └── StorageRepository.ts
├── services/
│   ├── AuthService.ts
│   ├── FoodLogService.ts
│   ├── NutritionCalculator.ts
│   ├── ProgressService.ts
│   └── ExportService.ts
├── stores/
│   ├── authStore.ts
│   ├── logStore.ts
│   ├── foodStore.ts
│   └── progressStore.ts
├── components/
│   ├── onboarding/
│   ├── dashboard/
│   ├── food-log/
│   ├── progress/
│   ├── settings/
│   └── shared/
├── pages/
│   ├── Login.tsx
│   ├── Onboarding.tsx
│   ├── Dashboard.tsx
│   ├── Log.tsx
│   ├── Progress.tsx
│   └── Settings.tsx
├── hooks/
│   ├── useNutrition.ts
│   ├── useFoodSearch.ts
│   └── useProgress.ts
├── types/
│   └── index.ts
└── tests/
    ├── unit/
    └── property/
```

### Data Flow

```
User interaction
    → React component
    → Zustand store action
    → Service method (pure logic)
    → StorageRepository / LocalFoodRepository
    → LocalStorage / foods.json
    → Zustand store state update
    → Component re-render
```

---

## Components and Interfaces

### `IFoodRepository` Interface

```typescript
interface IFoodRepository {
  search(query: string): FoodItem[];
  getById(id: string): FoodItem | FoodRepositoryError;
  getCategories(): string[];
}

type FoodRepositoryError = { error: true; message: string; id: string };
```

### `LocalFoodRepository`

- Loads `foods.json` at module initialisation time.
- Merges bundled items with user's `customFoods` from `StorageRepository` at query time.
- `search(query)`: case-insensitive substring match against `name` and `category`. Returns only matching items.
- `getById(id)`: checks bundled first then custom. Returns `FoodRepositoryError` (never null/undefined) if not found.
- `getCategories()`: union of all `category` values, de-duplicated and sorted.
- Custom food IDs use prefix `"custom_"` + UUID v4 to guarantee no collision with bundled numeric-string IDs.

### `StorageRepository`

```typescript
interface StorageRepository {
  get<T>(key: string, schema: ZodSchema<T>, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  estimatedUsageBytes(): number;
}
```

- `get`: deserialises JSON, validates with Zod, returns `fallback` (logging console.error) on any failure. Never throws.
- `set`: serialises to JSON, catches `QuotaExceededError` and logs warning.
- `estimatedUsageBytes()`: sums byte lengths of all `dietsync:*` keys and values.
- Key constants defined in a single `STORAGE_KEYS` object.

### `NutritionCalculator` (Pure Functions)

```typescript
function computeBMR(profile: Pick<UserProfile, 'sex' | 'weightKg' | 'heightCm' | 'dob'>): number;
function computeTDEE(bmr: number, activityLevel: ActivityLevel): number;
function computeGoalTarget(tdee: number, goal: Goal): number;
function scaleNutrients(food: FoodItem, servingGrams: number): ScaledNutrients;
function aggregateDayLog(entries: LogEntry[]): DayTotals;
function computeRemaining(consumed: number, target: number): number;
function computeProgressPct(consumed: number, target: number): number;
function checkCalorieFloor(calories: number, sex: Sex): boolean;
function sortWeightLog(entries: WeightEntry[]): WeightEntry[];
function computeWeeklyAverage(logs: Record<string, DayLog>, weekOf: Date): WeeklyStats;
function computeMonthlyAdherence(logs: Record<string, DayLog>, month: Date): DailyAdherence[];
function computeStreak(logs: Record<string, DayLog>, today: Date): number;
```

All functions are pure — no side effects, no I/O. Directly testable without mocking.

### `AuthService`

```typescript
interface AuthService {
  createAccount(profile: OnboardingData): Promise<{ userId: string }>;
  login(email: string, password: string): Promise<Session>;
  logout(): void;
  deleteAccount(userId: string): void;
  validateSession(): Session | null;
}
```

- PBKDF2: SHA-256, 100,000 iterations, 256-bit output, 16-byte random salt per user.
- Hash and salt stored as hex strings in `dietsync:auth` keyed by email.
- Session: 30-day expiry in `dietsync:session`.
- `deleteAccount`: scans all localStorage keys, removes those matching `dietsync:[userId]:*` and the auth entry.

### Zustand Stores

| Store | Slice | Key Actions |
|---|---|---|
| `authStore` | `currentUser`, `session` | `login`, `logout`, `createAccount` |
| `logStore` | `activeDate`, `dayLog` | `addEntry`, `editEntry`, `removeEntry`, `setDate` |
| `foodStore` | `searchResults`, `customFoods` | `search`, `addCustomFood`, `editCustomFood`, `deleteCustomFood` |
| `progressStore` | `streak`, `weeklyStats`, `monthlyStats`, `weightLog` | `refresh`, `addWeightEntry` |

Stores are thin: they call service methods, store results, and expose them to components.

### UI Pages

| Page | Key Components |
|---|---|
| **Login** | Email + password form; "local only" notice; no-password-reset notice |
| **Onboarding** | Multi-step wizard: profile data → TDEE preview → confirmation + disclaimer |
| **Dashboard** | Calorie progress bar; macro ring (Recharts PieChart); meal-by-meal breakdown |
| **Log** | Date navigator; meal section tabs; food search modal; entry list with edit/remove |
| **Progress** | Weekly adherence bar chart; monthly chart; streak badge; weight trend line chart |
| **Settings** | Goals editor; custom foods manager; account management; pruning config |

---

## Data Models

### TypeScript Types

```typescript
type Sex = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
type Goal = 'lose' | 'maintain' | 'gain';
type MealSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

interface FoodItem {
  id: string;
  name: string;
  category: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source?: string;
}

interface CustomFood extends FoodItem { isCustom: true; }

interface LogEntry {
  id: string;
  foodId: string;
  foodName: string;
  servingGrams: number;
  mealSection: MealSection;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface DayLog {
  date: string; // YYYY-MM-DD
  entries: LogEntry[];
}

interface UserProfile {
  userId: string;
  name: string;
  email: string;
  dob: string; // YYYY-MM-DD
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  createdAt: string;
}

interface NutritionGoals {
  calorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  isManual: boolean;
}

interface UserSettings {
  logPruningDays: number;   // default 90
  waterStepMl: number;      // default 250
  waterTargetMl: number;    // default 2000
}

interface Session {
  userId: string;
  expiresAt: string; // ISO timestamp
}

interface WeightEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
}
```

### LocalStorage Key Map

| Key | Type | Description |
|---|---|---|
| `dietsync:users` | `Record<string, UserProfile>` | All user profiles keyed by userId |
| `dietsync:auth` | `Record<string, AuthRecord>` | Password hash + salt keyed by email |
| `dietsync:session` | `Session` | Active session |
| `dietsync:[userId]:logs` | `Record<string, DayLog>` | Daily food logs keyed by YYYY-MM-DD |
| `dietsync:[userId]:weight` | `Record<string, number>` | Weight entries keyed by YYYY-MM-DD |
| `dietsync:[userId]:water` | `Record<string, number>` | Water totals keyed by YYYY-MM-DD |
| `dietsync:[userId]:customFoods` | `CustomFood[]` | User-defined food items |
| `dietsync:[userId]:goals` | `NutritionGoals` | Calorie and macro targets |
| `dietsync:[userId]:settings` | `UserSettings` | Per-user app settings |

### `foods.json` Schema

```json
{
  "version": "1.0.0",
  "items": [
    {
      "id": "1001",
      "name": "Brown Rice (cooked)",
      "category": "grains",
      "caloriesPer100g": 123,
      "proteinPer100g": 2.7,
      "carbsPer100g": 25.6,
      "fatPer100g": 1.0,
      "source": "USDA FoodData Central"
    }
  ]
}
```

Categories: `grains`, `dairy`, `proteins`, `fruits`, `vegetables`, `snacks`, `indian_staples`.

### Mifflin-St Jeor BMR Formulae

```
Male:   BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age_years) + 5
Female: BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age_years) − 161
```

### Activity Multipliers

| Level | Multiplier |
|---|---|
| Sedentary | 1.2 |
| Lightly active | 1.375 |
| Moderately active | 1.55 |
| Very active | 1.725 |
| Extra active | 1.9 |

TDEE = BMR × multiplier. All multipliers ≥ 1.2, so TDEE ≥ BMR is guaranteed for all valid inputs.

### Goal Modifiers

| Goal | Calorie Target |
|---|---|
| Lose | TDEE − 500 |
| Maintain | TDEE |
| Gain | TDEE + 500 |

lose < maintain < gain holds for all valid TDEE values.

### Serving-Size Scaling Formula

```
scaledNutrient = (per100gValue × servingGrams) / 100
```

Applied independently to calories, protein, carbs, and fat. At servingGrams = 0, all results are 0. At servingGrams = 2S, all results are exactly twice those at servingGrams = S (within IEEE 754 floating-point rounding).

### Atwater Calorie Factors

```
calories = (protein_g × 4) + (carbs_g × 4) + (fat_g × 9)
```

Stored `caloriesPer100g` values from USDA may differ from Atwater-derived values by up to 2 kcal per entry due to source rounding.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: TDEE is Always At Least BMR

For any valid anthropometric inputs, `computeTDEE(computeBMR(p), level) >= computeBMR(p)`.

**Validates: Requirements 7.7, 17.1**

### Property 2: TDEE is Monotonically Non-Decreasing with Activity Level

For any valid inputs and activity levels A > B, `computeTDEE(bmr, A) >= computeTDEE(bmr, B)`.

**Validates: Requirements 7.7, 17.2**

### Property 3: Goal-Modified Calorie Targets Are Correctly Ordered

For any valid TDEE, `loseTarget < maintainTarget < gainTarget`.

**Validates: Requirements 7.8, 17.3**

### Property 4: Macro Percentages Always Sum to 100

For any valid NutritionGoals, `proteinPct + carbsPct + fatPct === 100`.

**Validates: Requirements 7.3, 17.4**

### Property 5: Calorie Floor Warning Is Triggered for All Sub-Floor Inputs

`checkCalorieFloor(x, 'female') === true` for all x < 1200; `checkCalorieFloor(x, 'male') === true` for all x < 1500.

**Validates: Requirements 7.4, 7.5, 17.5, 17.6**

### Property 6: Invalid Food Entries Are Always Rejected

For any entry with a missing/null required field or negative numeric value, the validation layer returns a non-empty error array. For all valid entries, it returns an empty error array.

**Validates: Requirements 4.1, 4.2, 5.2, 18.1, 18.2, 18.4**

### Property 7: Non-Positive Serving Sizes Are Rejected

For any serving size ≤ 0, the validation layer returns an error.

**Validates: Requirements 18.3**

### Property 8: Zero Serving Yields Zero Nutrients

For any food item and servingGrams = 0, `scaleNutrients` returns 0 for all four nutrient values.

**Validates: Requirements 5.3, 19.1**

### Property 9: Nutrient Scaling is Linear

For any food and positive serving S, nutrients at 2S are within IEEE 754 tolerance of 2× nutrients at S. Each scaled value equals `(per100g × servingGrams) / 100`.

**Validates: Requirements 5.3, 19.2, 19.3**

### Property 10: Daily Nutrient Totals Are Order-Independent

For any DayLog, `aggregateDayLog` produces the same totals regardless of entry order or whether entries are grouped by MealSection first.

**Validates: Requirements 6.6, 20.1, 20.2, 20.3**

### Property 11: Calorie–Macro Consistency Per Entry and Per Day

Per entry: `|storedCalories - (protein×4 + carbs×4 + fat×9)| ≤ 2 kcal`. Per day with N entries: `|totalStoredCalories - atwater(totalMacros)| ≤ 2N kcal`.

**Validates: Requirements 12.1, 12.2, 21.1, 21.2**

### Property 12: Remaining Calories and Progress Percentage Are Unclamped

For C and T > 0: `remaining = T - C` (negative when C > T); `progress = (C/T) × 100` (above 100% when C > T). For T = 0: returns 0% without error.

**Validates: Requirements 6.4, 12.3, 22.1, 22.2, 22.3**

### Property 13: Search Returns No False Positives

Every item returned by `LocalFoodRepository.search(Q)` has a name or category containing Q as a case-insensitive substring.

**Validates: Requirements 3.3, 23.1**

### Property 14: Custom Food IDs Never Collide with Bundled IDs

No Custom_Food ID equals any bundled Food_DB item ID. The `"custom_"` prefix enforces this structurally.

**Validates: Requirements 4.6, 23.2**

### Property 15: Custom Food Mutations Are Reflected in Subsequent Queries

After edit: all subsequent queries return updated values. After delete: item is absent from all subsequent queries.

**Validates: Requirements 4.4, 4.5, 23.3, 23.4**

### Property 16: Week Boundary Membership is Consistent

Date D is included in `computeWeeklyAverage` if and only if D falls within that ISO week's Mon–Sun span. Days without entries are excluded from the divisor.

**Validates: Requirements 9.5, 24.1, 24.2**

### Property 17: Perfect Adherence Day Contributes 100%

A day where consumed = target contributes exactly 100% adherence.

**Validates: Requirements 24.3**

### Property 18: Streak Correctly Reflects Consecutive Logged Days

Consecutive logged days → streak = count. Any gap → streak resets to 0. Bridging a gap → streak increases by newly consecutive days added.

**Validates: Requirements 9.3, 9.4, 9.6, 25.1, 25.2, 25.3**

### Property 19: Weight Log Trend is Insertion-Order Independent

`sortWeightLog` output is always in ascending date order, identical regardless of insertion order. Sort is stable on duplicate dates.

**Validates: Requirements 8.3, 8.4, 26.1, 26.2, 26.3**

### Property 20: Serialisation Round-Trip Preserves All Data Types

For any valid instance of any stored type, `set` then `get` produces a deeply equal object. For any invalid JSON string, `get` returns the configured safe default without throwing.

**Validates: Requirements 11.1, 11.2, 30.1, 30.2, 30.3, 30.4**

### Property 21: Log Pruning Removes Only Entries Older Than the Threshold

Pruning removes only entries with dates strictly older than the threshold; all entries on or after the threshold are retained.

**Validates: Requirements 11.3, 30.5**

### Property 22: Water Additions Are Correctly Accumulated

N water additions on the same date sum to the arithmetic total. Totals for distinct dates D1 and D2 are fully independent.

**Validates: Requirements 14.5, 27.1, 27.2**

### Property 23: Recent Foods List Maintains Uniqueness and Size Invariants

List never exceeds 10 entries. No duplicate food item IDs. Repeated log of same food promotes it to top. New unique food added to a full list evicts the oldest.

**Validates: Requirements 15.1, 15.2, 15.3, 28.1, 28.2**

### Property 24: Copy-Yesterday Creates an Isolated Deep Copy

Copied entries are field-by-field equal to the source. Mutating today's log after copy does not alter the source DayLog.

**Validates: Requirements 16.1, 16.2, 28.3, 28.4**

### Property 25: PBKDF2 Hashing is Deterministic and Salt-Sensitive

Same password + same salt → same hash (determinism). Same password + different salts → different hashes. Wrong password always rejected.

**Validates: Requirements 1.5, 2.2, 29.1, 29.2, 29.3**

### Property 26: Multi-User Credential and Data Isolation

Credential operations on U1 have no effect on U2. Deleting U1 removes only U1's keys; all U2 keys remain intact.

**Validates: Requirements 2.1, 2.9, 29.4, 31.1, 31.2, 31.3**

---

## Error Handling

### LocalStorage Errors

| Scenario | Handling |
|---|---|
| JSON parse failure | `StorageRepository.get()` catches, logs `console.error`, returns safe default. Never throws. |
| Zod schema validation failure | Same as parse failure |
| `QuotaExceededError` on write | Caught, warning logged; user-facing toast if usage > 4 MB |
| Key not found | `get()` returns fallback; `remove()` is a no-op |

### Authentication Errors

| Scenario | Handling |
|---|---|
| Wrong password | Generic error: "Email or password is incorrect" |
| Expired session | Session removed; user redirected to Login |
| PBKDF2 failure | Promise rejection caught; surfaced as user-facing message |

### Food Repository Errors

| Scenario | Handling |
|---|---|
| `getById()` with unknown ID | Returns `FoodRepositoryError` — never null or undefined |
| foods.json fails to load | App shows graceful degradation message |

### Canvas Export Errors

| Scenario | Handling |
|---|---|
| Primary export method unavailable | Falls back to alternative method |
| Both methods unavailable | User-facing error message; no crash |

### Validation Errors

All validation produces typed `ValidationError` objects with a human-readable `message` and a `field` identifier. Components render these as inline error messages. No generic alerts used.

### Storage Usage Warning

`estimatedUsageBytes()` called after every write. When usage exceeds 4 MB, a non-blocking toast advises the user to review log history or adjust the pruning threshold.

---

## Testing Strategy

### Overview

Dual-layer testing approach:
1. **Unit tests** (Vitest): specific examples, edge cases, integration points, UI rendering.
2. **Property-based tests** (Vitest + fast-check): universal properties across all valid inputs for pure-function modules.

### Property-Based Testing Configuration

- **Framework**: fast-check with Vitest
- **Minimum iterations**: 100 per property (`{ numRuns: 100 }`)
- **Async properties**: Use `fc.asyncProperty` and `await fc.assert(...)` for PBKDF2 tests
- **Fake timer interaction**: Do NOT combine `vi.useFakeTimers()` with `fc.asyncProperty`. Mock `crypto.subtle` instead.

### fast-check Arbitrary Strategies

| Domain Type | Arbitrary Strategy |
|---|---|
| `Sex` | `fc.constantFrom('male', 'female')` |
| `ActivityLevel` | `fc.constantFrom('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active')` |
| `Goal` | `fc.constantFrom('lose', 'maintain', 'gain')` |
| `MealSection` | `fc.constantFrom('breakfast', 'lunch', 'dinner', 'snacks')` |
| Weight (kg) | `fc.float({ min: 1, max: 500, noNaN: true })` |
| Height (cm) | `fc.float({ min: 50, max: 300, noNaN: true })` |
| Age (years) | `fc.integer({ min: 10, max: 120 })` |
| Serving size (g) | `fc.float({ min: 0.01, max: 10000, noNaN: true })` |
| Calorie target | `fc.float({ min: 0, max: 10000, noNaN: true })` |
| `FoodItem` | `fc.record({ id: fc.string(), name: fc.string(), category: fc.string(), caloriesPer100g: fc.float({ min: 0, noNaN: true }), proteinPer100g: fc.float({ min: 0, noNaN: true }), carbsPer100g: fc.float({ min: 0, noNaN: true }), fatPer100g: fc.float({ min: 0, noNaN: true }) })` |
| `LogEntry` | Built from FoodItem arbitrary + MealSection + positive serving size |
| `DayLog` | `fc.record({ date: dateStringArb, entries: fc.array(logEntryArb) })` |
| Date string (YYYY-MM-DD) | `fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().slice(0, 10))` |
| Password | `fc.string({ minLength: 8, maxLength: 64 })` |
| Salt (hex) | `fc.hexaString({ minLength: 32, maxLength: 32 })` |

### Module-to-Property Mapping

| Module | Properties Covered |
|---|---|
| `NutritionCalculator` | 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 16, 17, 18, 19 |
| `LocalFoodRepository` | 13, 14, 15 |
| `StorageRepository` | 20, 21 |
| `AuthService` | 25, 26 |
| Validation layer | 6, 7 |
| `WaterService` (stretch) | 22 |
| Recent foods logic (stretch) | 23 |
| Copy-yesterday logic (stretch) | 24 |

### Test File Layout

```
src/tests/
├── unit/
│   ├── onboarding.test.ts
│   ├── session.test.ts
│   ├── foodSearchModal.test.ts
│   ├── dashboard.test.ts
│   ├── progress.test.ts
│   ├── exportService.test.ts
│   ├── manifest.test.ts
│   ├── foodsJson.test.ts
│   ├── storageWarning.test.ts
│   ├── integration.onboarding.test.ts
│   ├── integration.auth.test.ts
│   └── integration.foodlog.test.ts
└── property/
    ├── nutritionCalc.tdee.property.test.ts
    ├── nutritionCalc.macros.property.test.ts
    ├── nutritionCalc.scaling.property.test.ts
    ├── nutritionCalc.progress.property.test.ts
    ├── nutritionCalc.atwater.property.test.ts
    ├── validation.property.test.ts
    ├── localFoodRepository.property.test.ts
    ├── storageRepository.property.test.ts
    ├── authService.property.test.ts
    ├── logPruning.property.test.ts
    ├── waterTracker.property.test.ts
    ├── recentFoods.property.test.ts
    └── copyYesterday.property.test.ts
```

### Edge Cases to Cover

| Edge Case | Relevant Properties |
|---|---|
| Zero serving size | Property 8 |
| Zero calorie target (division-by-zero guard) | Property 12 |
| Empty DayLog (no entries) | Property 10 |
| All-gap streak (no consecutive days) | Property 18 |
| Single-entry week | Property 16 |
| Single weight entry (below chart threshold) | Property 19 |
| Water tracking date boundary | Property 22 |
| Recent foods list at exactly 10 items | Property 23 |
| Copy-yesterday with empty source log | Property 24 |
| PBKDF2 with identical password, different salts | Property 25 |
| Account deletion with only one account on device | Property 26 |
| LocalStorage with corrupted JSON | Property 20 |

---

## Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LocalStorage 5 MB cap | Prune logs older than configured threshold (default 90 days); warn at 4 MB |
| PBKDF2 async latency | Show loading spinner; target < 500 ms on mid-range hardware |
| Canvas export on iOS Safari | Attempt primary method; fall back to alternative before showing error |
| Stale food DB in service worker cache | Versioned cache key in Workbox config |
| Corrupted LocalStorage data | Zod validation on every read; safe default fallback; console.error logged |
| Multiple accounts on same device | Strict namespace isolation via userId-prefixed keys; verified by Property 26 |

---

## Diagrams

### Authentication Sequence

```
User                 Login Page           AuthStore            AuthService          StorageRepo
 |                       |                    |                     |                    |
 |--submit(email,pwd)--> |                    |                     |                    |
 |                       |--login(e,p)------> |                     |                    |
 |                       |                    |--login(e,p)-------> |                    |
 |                       |                    |                     |--get(auth[e])----> |
 |                       |                    |                     | <--AuthRecord----- |
 |                       |                    |                     |--PBKDF2(pwd,salt)->|
 |                       |                    |                     | <--hash-----------  |
 |                       |                    |                     |--compare hashes    |
 |                       |                    |                     |--set(session)----> |
 |                       |                    | <--Session--------- |                    |
 |                       | <--update store--- |                     |                    |
 |<--navigate dashboard--|                    |                     |                    |
```

### DayLog Update Data Flow

```
Log Page → logStore.addEntry(foodId, grams, section)
         → FoodLogService.addEntry(userId, date, foodId, grams, section)
           → LocalFoodRepository.getById(foodId)       → foods.json / customFoods
           → NutritionCalculator.scaleNutrients(food, grams)
           → Build LogEntry (UUID id, scaled values)
           → Load existing DayLog from StorageRepo
           → Append entry to DayLog
           → StorageRepo.set(dietsync:[userId]:logs, updatedLogs)
         → logStore.dayLog updated
         → Dashboard re-renders via Zustand subscription
```

### LocalStorage Namespace Isolation

```
dietsync:users         (shared)
dietsync:auth          (shared)
dietsync:session       (shared, one active session)

dietsync:[user-A-id]:logs
dietsync:[user-A-id]:weight
dietsync:[user-A-id]:water
dietsync:[user-A-id]:customFoods
dietsync:[user-A-id]:goals
dietsync:[user-A-id]:settings

dietsync:[user-B-id]:logs
dietsync:[user-B-id]:weight
dietsync:[user-B-id]:water
dietsync:[user-B-id]:customFoods
dietsync:[user-B-id]:goals
dietsync:[user-B-id]:settings
```

Account deletion removes all `dietsync:[userId]:*` keys plus the `dietsync:auth` entry for that user's email. All other keys are untouched.
