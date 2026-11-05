// ============================================================
//  AWS Starter Kit — Backend Server
//  Proxies S3 (file storage) and Bedrock Nova Pro (AI) so your
//  AWS credentials stay safe on the server, NEVER in the browser.
// ============================================================

import express from "express";
import cors from "cors";
import multer from "multer";
import "dotenv/config";

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// ---- Config -------------------------------------------------
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_BUCKET_NAME;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0";
const PORT = process.env.PORT || 3000;

// The AWS SDK automatically picks up credentials from either:
//  1) the AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in your .env, or
//  2) your "aws configure" default profile.
const s3 = new S3Client({ region: REGION });
const bedrock = new BedrockRuntimeClient({ region: REGION });

// ---- App setup ----------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serves the frontend demo

// Keep uploads in memory (fine for small event demo files).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ============================================================
//  FEATURE 1: Amazon S3 — Upload a file
//  POST /api/upload  (multipart/form-data, field name: "file")
// ============================================================
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!BUCKET) {
      return res
        .status(500)
        .json({ error: "S3_BUCKET_NAME is not set in your .env file." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file was uploaded." });
    }

    // Give the file a unique key so uploads don't overwrite each other.
    const key = `uploads/${Date.now()}-${req.file.originalname}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    // Create a temporary, secure link to view the file (valid 1 hour).
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: 3600 }
    );

    res.json({ success: true, key, url });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  FEATURE 1b: Amazon S3 — List uploaded files
//  GET /api/files
// ============================================================
app.get("/api/files", async (req, res) => {
  try {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "uploads/" })
    );
    const files = await Promise.all(
      (out.Contents || []).map(async (obj) => ({
        key: obj.Key,
        size: obj.Size,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
          { expiresIn: 3600 }
        ),
      }))
    );
    res.json({ files });
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  FEATURE 2: Amazon Bedrock Nova Pro — Ask the AI
//  POST /api/ai   body: { "prompt": "your question" }
// ============================================================
app.post("/api/ai", async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "A 'prompt' is required." });
    }

    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      // Optional system prompt to steer the AI's behavior/persona.
      system: systemPrompt ? [{ text: systemPrompt }] : undefined,
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const response = await bedrock.send(command);

    // Nova Pro's reply lives at output.message.content[].text
    const text =
      response.output?.message?.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join("\n") || "(no response)";

    res.json({ success: true, text });
  } catch (err) {
    console.error("Bedrock error:", err);
    // A friendly hint for the most common beginner error.
    const hint = /access|not authorized|model/i.test(err.message)
      ? " HINT: Make sure you requested access to Nova Pro in the Bedrock console for this region, and try the model ID 'us.amazon.nova-pro-v1:0'."
      : "";
    res.status(500).json({ error: err.message + hint });
  }
});

// ---- Health check -------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", region: REGION, model: MODEL_ID, bucket: BUCKET });
});

// ---- Start --------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n✅ Starter kit running!`);
  console.log(`   Open your browser at:  http://localhost:${PORT}`);
  console.log(`   Region: ${REGION} | Model: ${MODEL_ID} | Bucket: ${BUCKET}\n`);
});
