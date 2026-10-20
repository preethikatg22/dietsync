# Requirements Document

## Introduction

DietSync is a frontend-only Progressive Web App (PWA) that enables users to log daily food intake, track nutrition against personalised TDEE-based goals, and monitor weight progress. All data is stored exclusively in LocalStorage on the user's device. There is no backend server, no cloud sync, and no external data transmission. The application supports multiple user accounts per device with fully isolated data namespaces.

---

## Glossary

- **App**: The DietSync PWA running in the browser.
- **Auth_Module**: The component responsible for account creation, login, logout, and session management.
- **BMR**: Basal Metabolic Rate — the minimum daily calorie expenditure at rest.
- **Canvas_Exporter**: The component that renders and exports progress summary images using the Canvas API.
- **Custom_Food**: A user-defined food entry with a name, per-100g macro values, and an optional category.
- **DayLog**: The data record for all food entries logged on a single calendar date, keyed by `YYYY-MM-DD`.
- **Food_DB**: The bundled JSON food database (~300–400 items), sourced from USDA FoodData Central, including common Indian foods.
- **FoodRepository**: The `IFoodRepository` interface implementation that provides `search`, `getById`, and `getCategories` operations.
- **LocalFoodRepository**: The concrete implementation of `IFoodRepository` that reads `foods.json` and merges the user's Custom_Foods at query time.
- **LocalStorage_Manager**: The component responsible for reading, writing, validating, and pruning all LocalStorage data.
- **Meal_Section**: One of the four categorised log sections: Breakfast, Lunch, Dinner, or Snacks.
- **NutritionCalculator**: The pure-function module that computes BMR, TDEE, macro targets, and goal-modified calorie targets.
- **Onboarding_Wizard**: The multi-step form that collects user profile data on first account creation.
- **PWA_Shell**: The service-worker-cached application shell that enables offline access.
- **Session**: A login token stored in LocalStorage containing `userId` and `expiresAt`.
- **Streak**: The count of consecutive calendar days on which the user has logged at least one food entry.
- **TDEE**: Total Daily Energy Expenditure — BMR multiplied by an activity multiplier.
- **User**: An authenticated account on the device.
- **UserProfile**: The persisted record of a user's name, email, DOB, sex, height, weight, activity level, and goal.
- **Water_Tracker**: The component (stretch feature) that records daily water intake and tracks it against a target.
- **Weight_Log**: The persisted record mapping `YYYY-MM-DD` dates to body-weight values in kilograms.

---

## Requirements

---

### Requirement 1: User Onboarding

**User Story:** As a new user, I want to create an account by providing my profile information, so that the App can calculate personalised nutrition targets for me.

#### Acceptance Criteria

1. WHEN a new user starts onboarding, THE Onboarding_Wizard SHALL collect name, email address, date of birth, biological sex, height in centimetres (within 50–300 cm), current weight in kilograms (within 10–500 kg), activity level (one of: sedentary, lightly active, moderately active, very active, or extra active), and goal (one of: lose weight, maintain weight, or gain weight).
2. WHEN the Onboarding_Wizard collects profile data, THE NutritionCalculator SHALL compute BMR using the Mifflin-St Jeor formula and TDEE by multiplying BMR by the activity multiplier corresponding to the selected activity level, and the computed values SHALL be stored with the account before the account is saved.
3. WHEN the Onboarding_Wizard is completed, THE App SHALL display a UI note stating "DietSync provides general tracking only and is not medical or dietetic advice."
4. IF any required onboarding field is left empty, contains a non-numeric value where a number is expected, or contains a value outside the defined valid range for that field, THEN THE Onboarding_Wizard SHALL display an inline error message identifying the specific field and the reason for rejection, and SHALL prevent progression to the next step.
5. WHEN the Onboarding_Wizard is submitted, THE Auth_Module SHALL hash the password using PBKDF2 with a unique randomly-generated salt before persisting the account.
6. WHILE PBKDF2 hashing is in progress, THE App SHALL display a loading indicator.
7. IF the NutritionCalculator cannot produce a valid BMR or TDEE result from the submitted profile data, THEN THE Onboarding_Wizard SHALL display an error message indicating the profile data could not be processed and SHALL prevent account creation.

---

### Requirement 2: Authentication

**User Story:** As a user, I want to securely log in and out of my account on this device, so that my data is protected and isolated from other accounts on the same device.

#### Acceptance Criteria

1. THE Auth_Module SHALL support multiple user accounts on a single device, with each account's data stored in an isolated namespace keyed by a unique user ID.
2. WHEN a user submits login credentials, THE Auth_Module SHALL verify the password by hashing the supplied password with the stored salt and comparing the result to the stored hash.
3. IF the supplied password does not match the stored hash, THEN THE Auth_Module SHALL reject the login attempt and display an error message without revealing whether the email or the password was incorrect, and SHALL NOT apply any login lockout.
4. WHEN a user successfully logs in, THE Auth_Module SHALL create a Session containing the user ID and an expiry timestamp 30 days in the future and persist it to `dietsync:session`.
5. IF a Session exists and its `expiresAt` timestamp is earlier than the current time, THEN THE Auth_Module SHALL invalidate the Session and redirect the user to the login screen.
6. WHEN a user logs out, THE Auth_Module SHALL remove the active Session from LocalStorage.
7. THE App SHALL display the message "Local device only. Data does not sync across devices." on the login and account-creation screens.
8. WHEN the login screen is displayed, THE App SHALL display a notice that password reset is not available and that forgotten passwords cannot be recovered.
9. WHEN an account is deleted, THE LocalStorage_Manager SHALL remove every LocalStorage key prefixed with `dietsync:[userId]:` for that user, and SHALL NOT remove any key belonging to a different user.

---

### Requirement 3: Food Database

**User Story:** As a user, I want to search a built-in food database, so that I can quickly find nutritional information for common foods without entering values manually.

#### Acceptance Criteria

1. THE App SHALL bundle a food database of 300–400 items with per-100g macro values (calories, protein, carbohydrates, fat) sourced from USDA FoodData Central, including common Indian foods cross-referenced with IFCT where possible.
2. THE Food_DB SHALL be organised into categories: grains, dairy, proteins, fruits, vegetables, snacks, and Indian staples.
3. WHEN a user submits a search query of at least 1 character, THE LocalFoodRepository SHALL return only food items whose name or category contains the query as a case-insensitive substring (no false positives).
4. THE LocalFoodRepository SHALL merge the user's Custom_Foods with the bundled Food_DB at query time so that custom items appear in search results and category listings.
5. THE Food_DB SHALL carry a version identifier; WHEN THE PWA_Shell detects a new Food_DB version, it SHALL use a versioned cache key to invalidate the stale cached Food_DB before serving the repository.
6. IF a food item is requested by ID and the ID does not exist in either the bundled Food_DB or Custom_Foods, THEN THE LocalFoodRepository SHALL return a typed error object (never null or undefined) containing a descriptive message and the requested ID.
7. WHEN a search query matches zero items, THE LocalFoodRepository SHALL return an empty array rather than an error.

---

### Requirement 4: Custom Foods

**User Story:** As a user, I want to create, edit, and delete my own food entries, so that I can log foods that are not in the built-in database.

#### Acceptance Criteria

1. WHEN a user creates a Custom_Food, THE App SHALL require a name (1–100 characters) and per-100g values for calories, protein, carbohydrates, and fat (each 0–9999.9), and SHALL accept an optional category.
2. IF any required Custom_Food field contains a negative number, a non-numeric value, or a value outside its defined range, THEN THE App SHALL display a validation error and prevent the Custom_Food from being saved.
3. WHEN a user saves a Custom_Food, THE LocalStorage_Manager SHALL persist it to `dietsync:[userId]:customFoods` and THE LocalFoodRepository SHALL reflect the new item in subsequent search and category queries.
4. WHEN a user edits a Custom_Food, THE LocalStorage_Manager SHALL update the stored record and THE LocalFoodRepository SHALL return the updated values in all subsequent queries.
5. WHEN a user deletes a Custom_Food, THE LocalStorage_Manager SHALL remove it from `dietsync:[userId]:customFoods` and THE LocalFoodRepository SHALL no longer return it in any search or category queries.
6. THE LocalFoodRepository SHALL ensure that no Custom_Food ID collides with a bundled Food_DB item ID by using a `"custom_"` prefix on all generated Custom_Food IDs.
7. THE App SHALL prevent creating two Custom_Foods with the same name (case-insensitive).

---

### Requirement 5: Daily Food Log

**User Story:** As a user, I want to log the foods I eat each day across named meal sections, so that I can track my daily intake accurately.

#### Acceptance Criteria

1. THE App SHALL organise each day's food log into four Meal_Sections: Breakfast, Lunch, Dinner, and Snacks.
2. WHEN a user adds a food entry, THE App SHALL require selection of a food item (from the database or Custom_Foods), a Meal_Section, and a serving size in grams (0.1–2000 g) or a common unit defined for that food.
3. WHEN a serving size is entered, THE NutritionCalculator SHALL scale the food's per-100g macro values linearly using the formula `(per100gValue × servingGrams) / 100`, such that a 0 g serving yields 0 for all nutrients and a serving of 2× a reference quantity yields exactly double the reference nutrient values.
4. WHEN a user edits an existing food log entry, THE App SHALL update the entry's macro and calorie values and recalculate the day's totals.
5. WHEN a user removes a food log entry, THE App SHALL remove it from the DayLog and recalculate the day's totals.
6. WHEN a DayLog is saved, THE LocalStorage_Manager SHALL persist it to `dietsync:[userId]:logs` under the key `YYYY-MM-DD` corresponding to the logged date.
7. THE App SHALL display the current date's log by default and SHALL allow the user to navigate to previous dates.
8. IF a Custom_Food that has been logged is subsequently deleted, THEN the existing log entries referencing that food SHALL retain their stored macro values and not be removed from the DayLog.

---

### Requirement 6: Daily Dashboard

**User Story:** As a user, I want to see a summary of my daily nutrition on a dashboard, so that I can understand my progress towards my goals at a glance.

#### Acceptance Criteria

1. THE App SHALL display the total calories consumed for the current date versus the user's calorie target.
2. THE App SHALL display a macro ring chart showing consumed grams and percentages for protein, carbohydrates, and fat for the current date.
3. THE App SHALL display a meal-by-meal breakdown listing each Meal_Section with its total calories and macros.
4. THE App SHALL display the remaining calories (target minus consumed), which SHALL be shown as a negative value when consumption has exceeded the target, using a visually distinct style to indicate the over-target state.
5. WHEN the current date's log changes, THE App SHALL recalculate and re-render all dashboard totals without requiring a page reload.
6. THE NutritionCalculator SHALL compute the daily sum of calories, protein, carbohydrates, and fat by aggregating all log entries for the date such that the total equals the sum of per-entry values regardless of aggregation order.
7. WHEN no nutrition goals have been set, THE App SHALL display a prompt directing the user to configure their goals rather than showing zero or undefined targets.

---

### Requirement 7: Nutrition Goals

**User Story:** As a user, I want to set and adjust my calorie and macro targets, so that my tracking reflects my personal dietary plan.

#### Acceptance Criteria

1. WHEN a user completes onboarding, THE NutritionCalculator SHALL automatically set initial nutrition goals based on TDEE adjusted for the selected goal modifier (lose / maintain / gain weight).
2. THE App SHALL allow the user to manually override the auto-calculated calorie target and macro percentage split in settings.
3. WHEN macro percentage targets are set, THE App SHALL enforce that protein percentage plus carbohydrate percentage plus fat percentage equals 100% by blocking save if the sum is not exactly 100.
4. IF the user sets a calorie target below 1200 kcal and the user's sex is female, THEN THE App SHALL display a non-blocking floor warning before the save completes, and the user may proceed past the warning.
5. IF the user sets a calorie target below 1500 kcal and the user's sex is male, THEN THE App SHALL display a non-blocking floor warning before the save completes, and the user may proceed past the warning.
6. WHEN nutrition goals are saved, THE LocalStorage_Manager SHALL persist them to `dietsync:[userId]:goals`.
7. THE NutritionCalculator SHALL produce a TDEE value that is greater than or equal to BMR for all valid inputs, and SHALL produce TDEE values that are monotonically non-decreasing as activity level increases.
8. THE NutritionCalculator SHALL produce goal-modified targets such that the lose-weight target is strictly less than the maintain-weight target, and the maintain-weight target is strictly less than the gain-weight target.

---

### Requirement 8: Weight Log

**User Story:** As a user, I want to log my daily weight and view a trend chart, so that I can monitor my progress over time.

#### Acceptance Criteria

1. WHEN a user logs a weight entry, THE App SHALL accept a positive numeric weight value in kilograms (0.1–500 kg) and associate it with the current calendar date; if an entry for that date already exists it SHALL be overwritten.
2. WHEN a weight entry is saved, THE LocalStorage_Manager SHALL persist it to `dietsync:[userId]:weight` under the `YYYY-MM-DD` key.
3. THE App SHALL display a line trend chart of weight entries ordered chronologically by ascending date, and SHALL require at least 2 entries before rendering the chart.
4. THE NutritionCalculator SHALL produce a weight trend in which entries are sorted in ascending date order such that the ordering is consistent regardless of the order in which entries were logged.

---

### Requirement 9: Progress View

**User Story:** As a user, I want to see weekly and monthly progress summaries, so that I can evaluate my long-term adherence to my nutrition plan.

#### Acceptance Criteria

1. THE App SHALL display a weekly calorie adherence chart showing average daily calories consumed versus target for the current week (Monday through Sunday); days with no log entries SHALL render as 0% adherence on the chart.
2. THE App SHALL display a monthly calorie adherence chart showing per-day adherence percentage for the current month, where adherence is consumed calories divided by target calories expressed as a percentage.
3. THE App SHALL display the user's current Streak count, defined as the number of consecutive calendar days ending on today (or yesterday if today has no entry) on which at least one food entry was logged.
4. WHEN a calendar day passes with no food log entry, THE NutritionCalculator SHALL reset the Streak to zero on the next calculation.
5. THE NutritionCalculator SHALL compute weekly averages using only dates that fall within the Monday-to-Sunday boundary of the queried week, and SHALL include only dates that have at least one log entry in the divisor.
6. THE NutritionCalculator SHALL compute the Streak such that adding a consecutive log day increments the streak by one, and any gap of one or more days without a log resets the streak to zero.
7. THE App SHALL display the weight trend chart in the progress view.
8. WHEN the queried week has no logged days, THE App SHALL display an empty-state message rather than a zero-value chart.

---

### Requirement 10: PWA and Offline Support

**User Story:** As a user, I want to install and use the App offline, so that I can log food and view my data without an internet connection.

#### Acceptance Criteria

1. THE App SHALL include a Web App Manifest with a name, short name, icons (minimum 192×192 and 512×512 px), theme colour, background colour, and `standalone` display mode.
2. THE PWA_Shell SHALL register a service worker using vite-plugin-pwa with the `generateSW` strategy that pre-caches the application shell and the Food_DB.
3. WHILE the device is offline, THE App SHALL serve the full application shell and the Food_DB from the service worker cache, enabling food search, food logging, dashboard, and progress view functionality.
4. WHEN the Food_DB version changes, THE PWA_Shell SHALL use a versioned cache key to invalidate the stale cached Food_DB and fetch the updated version on the next network request.
5. IF the service worker fails to register, THE App SHALL continue to function in online mode and SHALL log a console warning; no user-facing crash SHALL occur.

---

### Requirement 11: LocalStorage Management and Data Integrity

**User Story:** As a user, I want my data to be stored reliably, so that it persists across sessions and degrades gracefully if storage is corrupted or nearly full.

#### Acceptance Criteria

1. THE LocalStorage_Manager SHALL serialise and deserialise every stored type (UserProfile, DayLog, NutritionGoals, Weight_Log, CustomFood, UserSettings, Session) to and from JSON, such that deserialising a serialised value produces a deeply equal object.
2. IF a LocalStorage read returns a value that fails schema validation, THEN THE LocalStorage_Manager SHALL return the safe default value for that type (empty object / empty array / null as appropriate), log a descriptive error to the browser console, and SHALL NOT throw an uncaught exception.
3. THE LocalStorage_Manager SHALL automatically prune food log entries older than the configured threshold (default 90 days) on each app load.
4. WHEN estimated LocalStorage usage exceeds 4 MB, THE App SHALL display a non-blocking warning to the user.
5. THE LocalStorage_Manager SHALL use the key namespaces defined in the data model: `dietsync:users`, `dietsync:auth`, `dietsync:session`, `dietsync:[userId]:logs`, `dietsync:[userId]:weight`, `dietsync:[userId]:water`, `dietsync:[userId]:customFoods`, `dietsync:[userId]:goals`, and `dietsync:[userId]:settings`.

---

### Requirement 12: Calorie–Macro Consistency

**User Story:** As a user, I want the calorie values derived from macros to be accurate, so that I can trust the nutritional data shown in the App.

#### Acceptance Criteria

1. THE NutritionCalculator SHALL compute calories from macros using the Atwater factors: 4 kcal per gram of protein, 4 kcal per gram of carbohydrate, and 9 kcal per gram of fat.
2. THE App SHALL accept food entries where the absolute difference between the stored calorie value and the Atwater-derived calorie value `(protein × 4) + (carbohydrates × 4) + (fat × 9)` is within 2 kcal per entry, accounting for rounding in source data.
3. THE NutritionCalculator SHALL compute progress percentage as `(consumed / target) × 100` without clamping, so that values above 100% are returned when consumption exceeds the target; WHEN the calorie target is zero, THE NutritionCalculator SHALL return 0% rather than throwing a division-by-zero error.

---

### Requirement 13: Stretch — Progress Export Card

**User Story:** As a user, I want to export a shareable progress summary image, so that I can share my achievements with others.

#### Acceptance Criteria

1. WHERE the export feature is enabled, THE Canvas_Exporter SHALL render a progress summary card of at least 600×400 px as a PNG image using the Canvas API.
2. WHERE the export feature is enabled, THE Canvas_Exporter SHALL allow the user to toggle visibility of individual fields: name, current weight, calorie stats, and Streak count; all fields SHALL default to visible.
3. WHERE the export feature is enabled, THE Canvas_Exporter SHALL trigger a file download of the rendered PNG when the user confirms the export.
4. IF the browser's image export API is unavailable, THE Canvas_Exporter SHALL attempt an alternative export method before displaying a user-facing error message.

---

### Requirement 14: Stretch — Water Tracking

**User Story:** As a user, I want to log daily water intake against a target, so that I can stay hydrated as part of my wellness routine.

#### Acceptance Criteria

1. WHERE water tracking is enabled, THE Water_Tracker SHALL display a daily water intake counter and allow the user to increment it in a configurable step size of 50–1000 ml.
2. WHERE water tracking is enabled, THE Water_Tracker SHALL display the consumed amount in ml versus the daily target in ml.
3. WHERE water tracking is enabled, THE LocalStorage_Manager SHALL persist the daily water total to `dietsync:[userId]:water` under the `YYYY-MM-DD` key.
4. WHEN the user opens the App on a different calendar date from their last session, THE Water_Tracker SHALL display zero for the new day's counter while preserving the previous day's persisted value.
5. THE Water_Tracker SHALL accumulate intake additions such that the total after N additions equals the sum of all individual additions made on that day.

---

### Requirement 15: Stretch — Recent Foods

**User Story:** As a user, I want quick access to the foods I logged recently, so that I can re-add frequently eaten items without searching.

#### Acceptance Criteria

1. THE App SHALL maintain a recent foods list containing the last 10 unique food item IDs logged by the user, ordered by most-recently-logged first.
2. WHEN a food item whose ID is already in the recent foods list is logged again, THE App SHALL promote it to the top of the list rather than creating a duplicate entry.
3. WHEN the recent foods list contains 10 items and a new unique food is logged, THE App SHALL remove the oldest item to maintain a maximum of 10 entries.
4. WHEN a user selects a food from the recent foods list, THE App SHALL prompt for a serving size (1–10,000 g) and add the entry to the log.

---

### Requirement 16: Stretch — Copy Yesterday

**User Story:** As a user, I want to copy the previous day's meal log to today, so that I can quickly log repeated daily eating patterns.

#### Acceptance Criteria

1. WHEN a user invokes copy-yesterday, THE App SHALL create a new DayLog for today containing deep copies of all food log entries from the previous calendar day's DayLog, with new unique IDs assigned to each copied entry.
2. WHEN a user invokes copy-yesterday, THE App SHALL NOT mutate the previous day's DayLog — the source DayLog SHALL remain unchanged after the copy operation.
3. IF the previous calendar day has no DayLog, THEN THE App SHALL display an informational message stating that no log exists for the previous day and SHALL NOT create an empty DayLog for today.
4. WHEN copy-yesterday is invoked and today's DayLog already contains entries, THE App SHALL prompt the user to choose between appending the copied entries or replacing today's entries entirely before proceeding.

---

## Property-Based Testing Requirements

### Requirement 17: PBT — NutritionCalculator Properties

**User Story:** As a developer, I want property-based tests for the NutritionCalculator, so that TDEE, BMR, and macro computations are correct across all valid input ranges.

#### Acceptance Criteria

1. FOR ALL valid anthropometric inputs, THE NutritionCalculator SHALL produce a TDEE value that is greater than or equal to the BMR value computed from the same inputs.
2. FOR ALL pairs of activity levels where level A is ordered higher than level B, THE NutritionCalculator SHALL produce a TDEE for level A that is greater than or equal to the TDEE for level B given the same anthropometric inputs.
3. FOR ALL valid inputs, THE NutritionCalculator SHALL produce a lose-weight calorie target that is strictly less than the maintain-weight target, and a gain-weight target that is strictly greater than the maintain-weight target.
4. FOR ALL valid NutritionGoals instances, the sum of proteinPct, carbsPct, and fatPct SHALL equal exactly 100.
5. FOR ALL calorie inputs strictly below 1200 kcal paired with female sex, THE NutritionCalculator SHALL indicate that the calorie floor warning must be triggered.
6. FOR ALL calorie inputs strictly below 1500 kcal paired with male sex, THE NutritionCalculator SHALL indicate that the calorie floor warning must be triggered.

---

### Requirement 18: PBT — Food and Meal Validation Properties

**User Story:** As a developer, I want property-based tests for food and meal entry validation, so that invalid data is rejected consistently across all input shapes.

#### Acceptance Criteria

1. FOR ALL food entries generated with any required field missing or set to null, THE App's validation layer SHALL reject the entry and return a non-empty error array.
2. FOR ALL food entries generated with a negative value for calories, protein, carbohydrates, or fat, THE App's validation layer SHALL reject the entry and return a non-empty error array.
3. FOR ALL serving size values less than or equal to zero, THE App's validation layer SHALL reject the entry and return a descriptive error.
4. FOR ALL Custom_Food inputs where per-100g macro values are non-negative and all required fields are present and within range, THE App's validation layer SHALL accept the entry.

---

### Requirement 19: PBT — Serving-Size Scaling Properties

**User Story:** As a developer, I want property-based tests for serving-size scaling, so that nutrient values scale correctly and linearly for all valid quantities.

#### Acceptance Criteria

1. FOR ALL food items and a serving size of 0 g, THE NutritionCalculator SHALL return 0 for all scaled nutrient values.
2. FOR ALL food items and a reference serving size S greater than 0, THE NutritionCalculator SHALL return nutrient values for a serving of 2S that are within IEEE 754 floating-point rounding tolerance of exactly double the nutrient values for serving S.
3. FOR ALL food items and any positive serving size, THE NutritionCalculator SHALL compute scaled values as `(per100gValue × servingGrams) / 100` for each nutrient within floating-point rounding tolerance.

---

### Requirement 20: PBT — Daily Totals Aggregation Properties

**User Story:** As a developer, I want property-based tests for daily totals, so that nutrient aggregation is correct regardless of entry order or meal section.

#### Acceptance Criteria

1. FOR ALL DayLog instances containing an arbitrary list of food entries, THE NutritionCalculator SHALL compute the same total calories regardless of the order in which entries are aggregated.
2. FOR ALL DayLog instances, THE NutritionCalculator SHALL compute the same total protein, carbohydrates, and fat regardless of aggregation order.
3. FOR ALL DayLog instances, THE NutritionCalculator SHALL compute the same totals whether entries are grouped by Meal_Section first or aggregated across all sections directly.

---

### Requirement 21: PBT — Calorie–Macro Consistency Properties

**User Story:** As a developer, I want property-based tests for calorie–macro consistency, so that the relationship between stored calorie values and macro-derived calorie values is always within tolerance.

#### Acceptance Criteria

1. FOR ALL food entries with non-negative macro values, the absolute difference between the stored calorie value and `(protein × 4) + (carbohydrates × 4) + (fat × 9)` SHALL be within 2 kcal.
2. FOR ALL daily totals with N entries, the absolute difference between total stored calories and Atwater-derived calories from total macros SHALL be within `2 × N` kcal.

---

### Requirement 22: PBT — Remaining vs Target and Progress Percentage Properties

**User Story:** As a developer, I want property-based tests for remaining and progress calculations, so that dashboard values are correct at all consumption levels.

#### Acceptance Criteria

1. FOR ALL pairs of consumed calories C and target calories T where T is greater than zero, THE NutritionCalculator SHALL compute remaining calories as `T − C`, which SHALL be negative when C exceeds T.
2. FOR ALL pairs of consumed calories C and target calories T where T is greater than zero, THE NutritionCalculator SHALL compute progress percentage as `(C / T) × 100` without clamping.
3. FOR ALL cases where the calorie target T equals zero, THE NutritionCalculator SHALL return 0% for progress percentage rather than throwing a division-by-zero error.

---

### Requirement 23: PBT — FoodRepository Properties

**User Story:** As a developer, I want property-based tests for the FoodRepository, so that search correctness, merge integrity, and mutation reflection are guaranteed.

#### Acceptance Criteria

1. FOR ALL search queries Q, every item returned by THE LocalFoodRepository SHALL have a name or category that contains Q as a case-insensitive substring.
2. FOR ALL states of the Custom_Foods list, no Custom_Food ID SHALL equal any bundled Food_DB item ID.
3. WHEN a Custom_Food is edited, FOR ALL subsequent queries, THE LocalFoodRepository SHALL return the updated field values for that item.
4. WHEN a Custom_Food is deleted, FOR ALL subsequent queries, THE LocalFoodRepository SHALL not include the deleted item in results.

---

### Requirement 24: PBT — Weekly Calculation Properties

**User Story:** As a developer, I want property-based tests for weekly calculations, so that week boundaries, averages, and adherence percentages are always correct.

#### Acceptance Criteria

1. FOR ALL dates D, THE NutritionCalculator SHALL include D in the weekly computation if and only if D falls between the Monday and Sunday (inclusive) of the ISO week containing D.
2. FOR ALL weeks with at least one logged day, THE NutritionCalculator SHALL compute the weekly average using only logged days (days with no entries are excluded from the divisor).
3. FOR ALL calendar days where consumed calories equals the calorie target, THE NutritionCalculator SHALL compute 100% adherence for that day.

---

### Requirement 25: PBT — Streak Calculation Properties

**User Story:** As a developer, I want property-based tests for streak calculation, so that the streak counter is always consistent with the sequence of logged days.

#### Acceptance Criteria

1. FOR ALL sequences of consecutive calendar days with at least one log entry on each day, THE NutritionCalculator SHALL compute a Streak equal to the count of those consecutive days.
2. FOR ALL log sequences containing a gap of one or more days without a log entry, THE NutritionCalculator SHALL compute a Streak covering only the days after the most recent gap.
3. FOR ALL log sequences, inserting a log entry on a previously empty day that bridges a gap SHALL increase the Streak by the number of newly consecutive days added.

---

### Requirement 26: PBT — Weight Log Properties

**User Story:** As a developer, I want property-based tests for the weight log, so that trend ordering is always correct regardless of insertion order.

#### Acceptance Criteria

1. FOR ALL Weight_Log entries inserted in any arbitrary order, THE App SHALL display weight entries sorted in ascending calendar date order.
2. FOR ALL Weight_Log subsets, the sorted order SHALL be stable.
3. FOR ALL Weight_Log queries, THE NutritionCalculator SHALL produce the same trend regardless of insertion order.

---

### Requirement 27: PBT — Water Tracking Properties (Stretch)

**User Story:** As a developer, I want property-based tests for water tracking, so that daily totals and reset boundaries are always correct.

#### Acceptance Criteria

1. FOR ALL sequences of N water additions on the same calendar date, THE Water_Tracker SHALL report a total equal to the arithmetic sum of all N additions.
2. FOR ALL pairs of distinct calendar dates D1 and D2, THE Water_Tracker SHALL store and retrieve independent totals for D1 and D2 without cross-contamination.

---

### Requirement 28: PBT — Recent Foods and Copy Yesterday Properties (Stretch)

**User Story:** As a developer, I want property-based tests for recent foods and copy-yesterday, so that list limits and copy isolation are guaranteed.

#### Acceptance Criteria

1. FOR ALL sequences of food logging events, THE App's recent foods list SHALL never contain more than 10 entries.
2. FOR ALL sequences of food logging events, THE App's recent foods list SHALL contain no duplicate food item IDs.
3. FOR ALL copy-yesterday operations, the resulting today DayLog SHALL contain entries with field values identical to those in the previous day's DayLog at the time of the copy.
4. FOR ALL copy-yesterday operations, any mutation to today's DayLog after the copy SHALL NOT alter the source DayLog.

---

### Requirement 29: PBT — PBKDF2 Authentication Properties

**User Story:** As a developer, I want property-based tests for PBKDF2 password hashing, so that authentication security invariants hold for all password and salt combinations.

#### Acceptance Criteria

1. FOR ALL passwords P and salts S, THE Auth_Module SHALL produce the same hash when PBKDF2 is applied to P with S a second time.
2. FOR ALL passwords P and two independently generated salts S1 ≠ S2, THE Auth_Module SHALL produce different hashes for (P, S1) and (P, S2).
3. FOR ALL pairs of a correct password P and an incorrect password P′ where P ≠ P′, THE Auth_Module SHALL reject the login attempt when P′ is supplied with the hash derived from P.
4. FOR ALL users U1 and U2 with different user IDs, credential operations on U1 SHALL have no effect on U2's authentication outcome.
5. THE test suite SHALL implement PBKDF2 property tests using `fc.asyncProperty` and the tests SHALL be compatible with fake timer usage by mocking `crypto.subtle` instead of using `vi.useFakeTimers()`.

---

### Requirement 30: PBT — LocalStorage Serialisation Properties

**User Story:** As a developer, I want property-based tests for LocalStorage serialisation, so that all data types round-trip correctly and corrupted data is handled safely.

#### Acceptance Criteria

1. FOR ALL valid instances of UserProfile, THE LocalStorage_Manager SHALL produce a serialised-then-deserialised value that is deeply equal to the original.
2. FOR ALL valid instances of DayLog, THE LocalStorage_Manager SHALL produce a serialised-then-deserialised value that is deeply equal to the original.
3. FOR ALL valid instances of NutritionGoals, CustomFood, WeightEntry, UserSettings, and Session, THE LocalStorage_Manager SHALL produce a serialised-then-deserialised value that is deeply equal to the original.
4. FOR ALL strings that are not valid JSON representations of the expected schema, THE LocalStorage_Manager SHALL return the safe default value for that type rather than throwing an uncaught exception.
5. FOR ALL DayLog stores containing entries older than the configured pruning threshold, THE LocalStorage_Manager SHALL remove only entries older than the threshold and SHALL retain all entries on or after the threshold date.

---

### Requirement 31: PBT — Account Deletion Isolation Properties

**User Story:** As a developer, I want property-based tests for account deletion, so that deleting one user's data never affects another user's data.

#### Acceptance Criteria

1. FOR ALL pairs of user accounts U1 and U2, WHEN U1's account is deleted, THE LocalStorage_Manager SHALL remove all keys matching `dietsync:[U1.userId]:*`.
2. FOR ALL pairs of user accounts U1 and U2, WHEN U1's account is deleted, THE LocalStorage_Manager SHALL retain all keys matching `dietsync:[U2.userId]:*` with their original values unchanged.
3. FOR ALL account deletion operations, THE LocalStorage_Manager SHALL also remove the `dietsync:auth` entry for the deleted user's email address.

---

## Future Enhancements (Out of Scope for MVP)

The following capabilities are explicitly deferred and SHALL NOT be implemented in the current phase:

- Real-time social feed and community features
- Cross-device cloud synchronisation
- Weekly meal planner
- Barcode scanner for food identification
- Third-party food API integration
- AI-generated meal suggestions
- Grocery list generation from meal plans
