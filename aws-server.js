// ─────────────────────────────────────────────────────────────────────────────
// DietSync — AWS backend server
// Runs alongside the Vite frontend (different port).
// Proxies all AWS calls (S3 + Bedrock) so credentials never go to the browser.
//
// Start with:  node aws-server.js
// Runs on:     http://localhost:3001
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import awsRoutes from './aws/awsRoutes.js';

const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || 'ap-southeast-2';
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';

const app = express();
const PORT = process.env.AWS_SERVER_PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev ? true : [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://dietsyncpreethikaa.vercel.app',
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(express.json({ limit: '5mb' })); // S3 sync payloads can be large

// All AWS routes under /api/aws
app.use('/api/aws', awsRoutes);

// Health check — open http://localhost:3001/api/health to verify it's running
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    region: process.env.AWS_REGION || 'us-east-1',
    model: process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0',
    bucket: process.env.S3_BUCKET_NAME || '(not set)',
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ DietSync AWS server running at http://localhost:${PORT}`);
  console.log(`   S3 bucket : ${process.env.S3_BUCKET_NAME || '⚠️  S3_BUCKET_NAME not set'}`);
  console.log(`   Bedrock   : ${process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0'}`);
  console.log(`   Region    : ${process.env.AWS_REGION || 'us-east-1'}\n`);
});
