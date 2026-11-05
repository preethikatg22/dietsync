#!/usr/bin/env node
// ============================================================
//  AWS Kit — Setup Generator
//  Installs dependencies and generates tailored S3 + Bedrock
//  (Nova Lite) files into the student's project.
//
//  Usage (Kiro runs this after the student confirms):
//    node aws-kit/setup.mjs --mode=add-node-backend --features=s3,bedrock
//    node aws-kit/setup.mjs --mode=existing-backend  --features=s3,bedrock
//
//  --mode:
//    add-node-backend  -> frontend-only project; create a small Express server
//    existing-backend  -> add a mountable router into the student's Node backend
//  --features: comma list of s3,bedrock (default: both)
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const KIT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(KIT_DIR, "..");

// ---- parse args ---------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const MODE = args.mode || "add-node-backend";
const FEATURES = String(args.features || "s3,bedrock").split(",").map((s) => s.trim());
const wantS3 = FEATURES.includes("s3");
const wantBedrock = FEATURES.includes("bedrock");

const log = (m) => console.log(m);
const writeFile = (rel, content) => {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (fs.existsSync(full)) {
    log(`  • skipped (already exists): ${rel}`);
    return;
  }
  fs.writeFileSync(full, content);
  log(`  • created: ${rel}`);
};

log(`\n🔧 AWS Kit setup — mode=${MODE}, features=${FEATURES.join("+")}\n`);

// ============================================================
//  TEMPLATES
// ============================================================

const envExample = `# Copy to .env and fill in. NEVER commit .env or share keys.
AWS_REGION=us-east-1
S3_BUCKET_NAME=my-unique-student-bucket
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
PORT=3000
`;

// Reusable S3 module (framework-agnostic)
const s3Module = `// aws/s3.js — reusable Amazon S3 helper
import {
  S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region });

export async function uploadToS3(buffer, originalName, contentType) {
  if (!bucket) throw new Error("S3_BUCKET_NAME is not set in .env");
  const key = \`uploads/\${Date.now()}-\${originalName}\`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: buffer, ContentType: contentType,
  }));
  const url = await getSignedUrl(
    s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 }
  );
  return { key, url };
}

export async function listS3Files() {
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: "uploads/" })
  );
  return Promise.all((out.Contents || []).map(async (o) => ({
    key: o.Key, size: o.Size,
    url: await getSignedUrl(
      s3, new GetObjectCommand({ Bucket: bucket, Key: o.Key }), { expiresIn: 3600 }
    ),
  })));
}
`;

// Reusable Bedrock (Nova Lite) module
const bedrockModule = `// aws/bedrock.js — reusable Amazon Bedrock (Nova Lite) helper
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION || "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const bedrock = new BedrockRuntimeClient({ region });

export async function askAI(prompt, systemPrompt) {
  if (!prompt) throw new Error("A prompt is required");
  const res = await bedrock.send(new ConverseCommand({
    modelId,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    inferenceConfig: { maxTokens: 500, temperature: 0.7, topP: 0.9 },
  }));
  return res.output?.message?.content?.map((c) => c.text).filter(Boolean).join("\\n")
    || "(no response)";
}
`;

// Express router that mounts into an existing backend
const awsRouter = `// aws/awsRoutes.js — mountable router: app.use("/api/aws", awsRoutes)
import { Router } from "express";
import multer from "multer";
${wantS3 ? 'import { uploadToS3, listS3Files } from "./s3.js";' : ""}
${wantBedrock ? 'import { askAI } from "./bedrock.js";' : ""}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const hint = (msg) => /access|not authorized|model/i.test(msg)
  ? " HINT: Enable Nova Lite access in the Bedrock console (us-east-1), or try us.amazon.nova-lite-v1:0."
  : "";
${wantS3 ? `
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const { key, url } = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ success: true, key, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/files", async (_req, res) => {
  try { res.json({ files: await listS3Files() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
` : ""}${wantBedrock ? `
router.post("/ai", async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body || {};
    const text = await askAI(prompt, systemPrompt);
    res.json({ success: true, text });
  } catch (e) { res.status(500).json({ error: e.message + hint(e.message) }); }
});
` : ""}
export default router;
`;

// Standalone server for frontend-only projects
const standaloneServer = `// aws-server.js — standalone AWS backend for your frontend.
// Keeps AWS keys on the server. Start with: npm run aws-server
import express from "express";
import cors from "cors";
import "dotenv/config";
import awsRoutes from "./aws/awsRoutes.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/aws", awsRoutes);
app.get("/api/aws/health", (_req, res) =>
  res.json({ status: "ok", region: process.env.AWS_REGION, model: process.env.BEDROCK_MODEL_ID }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`\\n✅ AWS backend on http://localhost:\${PORT}\\n\`));
`;

// Frontend snippet students can copy into their site
const frontendSnippet = `<!-- aws/frontend-snippet.html -->
<!-- Copy these calls into YOUR site. They talk to the backend, never to AWS directly. -->
<script>
const AWS_API = "http://localhost:3000/api/aws";

async function awsUpload(file) {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch(AWS_API + "/upload", { method: "POST", body: fd });
  return r.json(); // { url, key }
}

async function awsAsk(prompt) {
  const r = await fetch(AWS_API + "/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return r.json(); // { text }
}
</script>
`;

// ============================================================
//  1) Install dependencies
// ============================================================
const pkgPath = path.join(ROOT, "package.json");
if (!fs.existsSync(pkgPath)) {
  log("📦 No package.json found — creating one (frontend-only project).");
  fs.writeFileSync(pkgPath, JSON.stringify({
    name: "my-aws-website", version: "1.0.0", type: "module",
    scripts: { "aws-server": "node aws-server.js", start: "node aws-server.js" },
  }, null, 2));
}

const deps = ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner",
  "@aws-sdk/client-bedrock-runtime", "@aws-sdk/client-sts", "dotenv"];
if (MODE === "add-node-backend") deps.push("express", "cors", "multer");
else deps.push("multer"); // existing backend already has express

log("📦 Installing dependencies (this may take a moment)...");
try {
  execSync(`npm install ${deps.join(" ")}`, { cwd: ROOT, stdio: "inherit" });
} catch {
  log("⚠️  npm install failed — run it manually:\n   npm install " + deps.join(" "));
}

// ============================================================
//  2) Generate files
// ============================================================
log("\n📝 Generating AWS files...");
if (wantS3) writeFile("aws/s3.js", s3Module);
if (wantBedrock) writeFile("aws/bedrock.js", bedrockModule);
writeFile("aws/awsRoutes.js", awsRouter);
writeFile("aws/frontend-snippet.html", frontendSnippet);

if (!fs.existsSync(path.join(ROOT, ".env"))) writeFile(".env", envExample);

let launchHint = "";
if (MODE === "add-node-backend") {
  writeFile("aws-server.js", standaloneServer);
  launchHint = "Start the AWS backend with:  npm run aws-server  (then open http://localhost:3000)";
} else if (MODE === "existing-backend") {
  launchHint =
    "Mount the router in your existing server file:\n" +
    '      import awsRoutes from "./aws/awsRoutes.js";\n' +
    '      app.use("/api/aws", awsRoutes);\n' +
    "   Make sure your server loads dotenv (import \"dotenv/config\").";
}

// ============================================================
//  3) Done
// ============================================================
log(`
✅ Setup complete!

What was created (under your project):
  aws/                  reusable AWS helper modules + a frontend snippet
${MODE === "add-node-backend" ? "  aws-server.js         a tiny backend that serves the AWS API\n" : ""}  .env                  your config (edit S3_BUCKET_NAME!)

NEXT STEPS:
  1. Create your S3 bucket:   aws s3 mb s3://YOUR-UNIQUE-BUCKET --region us-east-1
  2. Edit .env -> set S3_BUCKET_NAME to that bucket
  3. Enable "Nova Lite" model access in the Bedrock console (us-east-1)
  4. Run:  aws configure   (paste your IAM access keys)
  5. Ask Kiro: "verify my AWS credentials"   (runs node aws-kit/verify.mjs)
  6. ${launchHint}

API endpoints now available:
${wantS3 ? "  POST /api/aws/upload   (form field: file)\n  GET  /api/aws/files\n" : ""}${wantBedrock ? "  POST /api/aws/ai       (JSON: { prompt })\n" : ""}`);
