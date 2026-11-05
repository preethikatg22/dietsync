#!/usr/bin/env node
// ============================================================
//  AWS Kit — Credential & Access Verifier
//  Checks three things with friendly, beginner-focused output:
//    1. Are AWS credentials working?        (STS GetCallerIdentity)
//    2. Can we access the S3 bucket?         (HeadBucket)
//    3. Can we invoke Bedrock Nova Lite?      (Converse ping)
//
//  Run:  node aws-kit/verify.mjs
//  Reads config from the project's .env (parent folder).
// ============================================================

import fs from "node:fs";
import path from "node:path";

const KIT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(KIT_DIR, "..");

// ---- load .env manually (no dependency required) -----------
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_BUCKET_NAME;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

const PASS = "✅", FAIL = "❌", WARN = "⚠️ ";
let failures = 0;

console.log(`\n==================== AWS KIT — VERIFY ====================`);
console.log(`Region: ${REGION} | Bucket: ${BUCKET || "(not set)"} | Model: ${MODEL_ID}\n`);

// Dynamic imports so a clear message shows if deps aren't installed yet.
let STS, S3, Bedrock;
try {
  STS = await import("@aws-sdk/client-sts");
  S3 = await import("@aws-sdk/client-s3");
  Bedrock = await import("@aws-sdk/client-bedrock-runtime");
} catch {
  console.log(`${FAIL} AWS SDK not installed yet.`);
  console.log(`   Run the setup first:  node aws-kit/setup.mjs`);
  console.log(`   (or: npm install @aws-sdk/client-sts @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime)\n`);
  process.exit(1);
}

// ---- 1) STS identity ----------------------------------------
try {
  const sts = new STS.STSClient({ region: REGION });
  const id = await sts.send(new STS.GetCallerIdentityCommand({}));
  console.log(`${PASS} Credentials work. Account: ${id.Account}`);
  console.log(`   Identity: ${id.Arn}`);
} catch (e) {
  failures++;
  console.log(`${FAIL} Credentials NOT working.`);
  console.log(`   ${e.name}: ${e.message}`);
  console.log(`   FIX: Run  aws configure  and paste your IAM Access Key ID + Secret.`);
}

// ---- 2) S3 bucket access ------------------------------------
if (!BUCKET || BUCKET === "my-unique-student-bucket") {
  console.log(`${WARN} S3 bucket not set. Edit .env -> S3_BUCKET_NAME, then re-run.`);
} else {
  try {
    const s3 = new S3.S3Client({ region: REGION });
    await s3.send(new S3.HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`${PASS} S3 bucket "${BUCKET}" is reachable.`);
  } catch (e) {
    failures++;
    console.log(`${FAIL} Cannot access S3 bucket "${BUCKET}".`);
    console.log(`   ${e.name}: ${e.message}`);
    if (/NotFound|NoSuchBucket/i.test(e.name + e.message))
      console.log(`   FIX: Create it ->  aws s3 mb s3://${BUCKET} --region ${REGION}`);
    else if (/403|Forbidden/i.test(e.name + e.message))
      console.log(`   FIX: Your IAM user needs S3 access. Attach aws-kit/iam-policy.json (with this bucket name).`);
    else
      console.log(`   FIX: Check the bucket name and that it's in region ${REGION}.`);
  }
}

// ---- 3) Bedrock Nova Lite access ----------------------------
try {
  const br = new Bedrock.BedrockRuntimeClient({ region: REGION });
  const out = await br.send(new Bedrock.ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: "user", content: [{ text: "Reply with the single word: ok" }] }],
    inferenceConfig: { maxTokens: 5, temperature: 0 },
  }));
  const text = out.output?.message?.content?.map((c) => c.text).join("") || "";
  console.log(`${PASS} Bedrock model "${MODEL_ID}" works. Reply: "${text.trim()}"`);
} catch (e) {
  failures++;
  console.log(`${FAIL} Cannot invoke Bedrock model "${MODEL_ID}".`);
  console.log(`   ${e.name}: ${e.message}`);
  if (/AccessDenied|not authorized|don't have access|ValidationException/i.test(e.name + e.message)) {
    console.log(`   FIX 1: Enable model access -> Bedrock console (region ${REGION}) -> Model access -> enable "Nova Lite".`);
    console.log(`   FIX 2: Some accounts need the inference profile. In .env set:`);
    console.log(`          BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0`);
  } else if (/could not load credentials|security token/i.test(e.message)) {
    console.log(`   FIX: Credentials issue — run  aws configure  first.`);
  }
}

// ---- summary ------------------------------------------------
console.log(`\n----------------------------------------------------------`);
if (failures === 0) {
  console.log(`${PASS} All checks passed! You're ready to launch. 🚀`);
  console.log(`   Start your site, then open http://localhost:${process.env.PORT || 3000}`);
} else {
  console.log(`${FAIL} ${failures} check(s) failed. Fix the item(s) above and re-run:`);
  console.log(`   node aws-kit/verify.mjs`);
}
console.log(`==========================================================\n`);
process.exit(failures === 0 ? 0 : 1);
