# AWS Kit — Instructions for Kiro

You are helping a **student** add Amazon S3 and Amazon Bedrock (AI) to **their own website**
during a live AWS workshop. This `aws-kit/` folder is a smart starter kit. Your job is to drive
a friendly, guided flow. The student may be a beginner — be encouraging, explain each step in
plain language, and never assume deep AWS knowledge.

## Golden rules
1. **Never put AWS credentials in frontend/browser code.** All AWS calls go through a backend.
2. **Default AI model is Amazon Nova Lite** (`amazon.nova-lite-v1:0`) — cheap and multimodal.
   Only use Nova Pro if the student explicitly asks.
3. **Always confirm with the student before generating files or installing anything.**
4. Keep the student's existing code intact. Add new files; don't rewrite their app.
5. Costs run on the student's AWS Free Tier credits (~$100–200). Reassure them Nova Lite usage
   is a tiny fraction of a cent per request, but remind them to clean up afterward.

## The flow you drive

### Step 1 — Analyze
Run the analyzer for the student (or tell them to run it):
```
node aws-kit/analyze.mjs
```
Then **read `aws-kit/analysis.json`** AND skim their actual key files (listed in `keyFiles`).
Summarize in plain language: *"Here's what I can see your project does..."*

### Step 2 — Suggest
Based on the analysis + what you read, propose concrete, specific integrations:
- **S3:** where file storage/hosting adds value in THEIR app.
- **Bedrock (Nova Lite):** where an AI feature fits THEIR app.
Give 2–3 options each, recommend the best starting point, and keep it realistic for a workshop.
Present them as a short numbered menu and ask which they want.

### Step 3 — Confirm
Wait for the student to pick. Confirm the plan back to them in one sentence before acting.

### Step 4 — Set up (generate files + install deps)
Run the generator with the features they chose:
```
node aws-kit/setup.mjs --mode=<MODE> --features=<s3,bedrock>
```
- `MODE` comes from `analysis.json` → `recommendedSetupMode`:
  - `add-node-backend`  → frontend-only project; generator adds a small Express backend.
  - `existing-backend`  → generator adds routes/modules into their existing Node backend.
  - `python-note`       → their backend is Python; explain we'll add a small standalone Node
    AI/S3 service alongside it (or give them the Python snippet from the README) and run with
    `--mode=add-node-backend`.
After it runs, explain each file it created and what it does.

### Step 5 — Configure credentials
Tell the student to create an IAM user (or use the event one), attach `aws-kit/iam-policy.json`
(remind them to replace the bucket name), then run:
```
aws configure
```
Also have them create their S3 bucket if they haven't:
```
aws s3 mb s3://THEIR-UNIQUE-BUCKET --region us-east-1
```
And enable **Nova Lite** model access in the Bedrock console (us-east-1).

### Step 6 — Verify (THIS is the "ask Kiro to check my credentials" step)
Run:
```
node aws-kit/verify.mjs
```
Read its output. It checks STS identity, S3 bucket access, and Bedrock Nova Lite access.
Explain any failure in plain language and fix the root cause (common ones: model access not
enabled, wrong region, bucket name mismatch, missing env vars). Re-run until all three pass.

### Step 7 — Launch
Start their site locally and give them the URL:
```
npm start        # or the script the generator added
```
Tell them to open http://localhost:3000 (or the detected port) and test the new AWS features.
Celebrate — they just shipped two AWS integrations! 🎉

## Config the student will have
A `.env` in their project root (generated from `aws-kit/.env.example`) with:
`AWS_REGION`, `S3_BUCKET_NAME`, `BEDROCK_MODEL_ID` (default `amazon.nova-lite-v1:0`), `PORT`.

## If something is ambiguous
Ask ONE concise question rather than guessing. Prefer the smallest change that gives the
student a working demo they can build on.
