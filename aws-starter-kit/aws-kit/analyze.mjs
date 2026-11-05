#!/usr/bin/env node
// ============================================================
//  AWS Kit — Project Analyzer
//  Scans the STUDENT'S project (the parent folder of aws-kit/)
//  and writes aws-kit/analysis.json + a human summary.
//  Kiro reads this to understand the project and suggest
//  where S3 and Bedrock (Nova Lite) fit.
//
//  Run from the student's project root:  node aws-kit/analyze.mjs
// ============================================================

import fs from "node:fs";
import path from "node:path";

// The project root is the parent of the aws-kit folder.
const KIT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(KIT_DIR, "..");

const IGNORE = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next",
  ".cache", "coverage", ".vercel", ".aws-kit-tmp", "aws-kit",
]);

// ---- tiny helpers -------------------------------------------
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const readJSON = (p) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); }
  catch { return null; }
};

function walk(dir, depth = 0, acc = []) {
  if (depth > 4) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env") continue;
    if (IGNORE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, acc);
    else acc.push(path.relative(ROOT, full));
  }
  return acc;
}

// ---- gather facts -------------------------------------------
const files = walk(ROOT);
const pkg = readJSON("package.json");
const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
const has = (d) => Boolean(deps[d]);

const ext = (f) => path.extname(f).toLowerCase();
const countExt = (e) => files.filter((f) => ext(f) === e).length;

// ---- detect language ----------------------------------------
let language = "unknown";
if (countExt(".ts") + countExt(".tsx") > 0) language = "TypeScript";
else if (countExt(".js") + countExt(".jsx") + countExt(".mjs") > 0) language = "JavaScript";
else if (countExt(".py") > 0) language = "Python";
if (countExt(".html") > 0 && language === "unknown") language = "HTML/CSS/JS";

// ---- detect framework ---------------------------------------
let framework = "Plain HTML/CSS/JS";
if (has("next")) framework = "Next.js";
else if (has("react")) framework = "React";
else if (has("vue")) framework = "Vue";
else if (has("@angular/core")) framework = "Angular";
else if (has("svelte")) framework = "Svelte";
else if (has("express") || has("fastify") || has("koa")) framework = "Node backend";

// ---- detect existing backend --------------------------------
const backendDeps = ["express", "fastify", "koa", "next", "@hapi/hapi"];
const hasNodeBackend = backendDeps.some(has);
const hasPythonBackend =
  files.some((f) => /app\.py|main\.py|manage\.py|requirements\.txt/.test(f));

let backend = "none (frontend-only)";
if (hasNodeBackend) backend = "existing Node backend";
else if (hasPythonBackend) backend = "existing Python backend";

// Try to find the backend entry file.
const backendEntry =
  ["server.js", "app.js", "index.js", "server.mjs", "src/server.js", "src/index.js"]
    .find(exists) || null;

// ---- detect feature signals (for smart suggestions) ---------
function readAll(candidates) {
  for (const c of candidates) {
    try { return fs.readFileSync(path.join(ROOT, c), "utf8"); } catch {}
  }
  return "";
}

const allText = files.join("\n").toLowerCase();
const htmlText = readAll(["index.html", "public/index.html", "src/index.html"]).toLowerCase();
const signals = {
  hasFileInput: /<input[^>]*type=["']file/.test(htmlText),
  mentionsUpload: /upload|avatar|profile.?pic|image|photo|gallery|attachment/.test(allText + htmlText),
  mentionsChatOrAI: /chat|assistant|bot|ai|summar|generate|prompt/.test(allText + htmlText),
  mentionsBlogOrContent: /blog|post|article|product|description|review/.test(allText + htmlText),
  mentionsForm: /form|contact|feedback|comment/.test(allText + htmlText),
};

// ---- build suggestions --------------------------------------
const s3Suggestions = [];
const bedrockSuggestions = [];

if (signals.mentionsUpload || signals.hasFileInput)
  s3Suggestions.push("Store user file/image uploads (you have upload-related code/UI).");
if (signals.mentionsForm)
  s3Suggestions.push("Save form attachments or exported submissions to S3.");
if (signals.mentionsBlogOrContent)
  s3Suggestions.push("Host images/media for your posts or products in S3.");
if (s3Suggestions.length === 0)
  s3Suggestions.push("Add a file-upload feature (profile pictures, documents) backed by S3.");
if (framework === "Plain HTML/CSS/JS")
  s3Suggestions.push("Optionally host the whole static site on S3 for a live URL.");

if (signals.mentionsChatOrAI)
  bedrockSuggestions.push("Add an AI chat/assistant widget (you already reference chat/AI).");
if (signals.mentionsBlogOrContent)
  bedrockSuggestions.push("Auto-generate titles, summaries, or product descriptions with Nova Lite.");
if (signals.mentionsForm)
  bedrockSuggestions.push("Summarize or auto-reply to form/feedback submissions.");
if (bedrockSuggestions.length === 0)
  bedrockSuggestions.push("Add a 'Summarize this' or Q&A feature powered by Nova Lite.");

// ---- write report -------------------------------------------
const analysis = {
  generatedAt: new Date().toISOString(),
  projectRoot: ROOT,
  language,
  framework,
  backend,
  backendEntry,
  packageManager: exists("yarn.lock") ? "yarn" : exists("pnpm-lock.yaml") ? "pnpm" : "npm",
  fileCount: files.length,
  keyFiles: files.filter((f) =>
    /\.(html|js|jsx|ts|tsx|py|json)$/.test(f) && !f.includes("aws-kit")
  ).slice(0, 40),
  signals,
  suggestions: { s3: s3Suggestions, bedrock: bedrockSuggestions },
  recommendedSetupMode: hasNodeBackend
    ? "existing-backend"
    : hasPythonBackend
    ? "python-note"
    : "add-node-backend",
};

fs.writeFileSync(
  path.join(KIT_DIR, "analysis.json"),
  JSON.stringify(analysis, null, 2)
);

// ---- print friendly summary (also read by Kiro) ------------
console.log(`
==================== AWS KIT — PROJECT ANALYSIS ====================
Project root : ${ROOT}
Language     : ${language}
Framework    : ${framework}
Backend      : ${backend}${backendEntry ? ` (entry: ${backendEntry})` : ""}
Files scanned: ${analysis.fileCount}
Setup mode   : ${analysis.recommendedSetupMode}

WHERE AMAZON S3 COULD HELP:
${s3Suggestions.map((x) => "  • " + x).join("\n")}

WHERE AMAZON BEDROCK (Nova Lite) COULD HELP:
${bedrockSuggestions.map((x) => "  • " + x).join("\n")}

Full machine-readable report written to: aws-kit/analysis.json

NEXT: Ask Kiro — "based on the analysis, what should I add and how?"
Then confirm, and run:  node aws-kit/setup.mjs
====================================================================
`);
