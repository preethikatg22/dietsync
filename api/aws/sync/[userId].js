// Vercel Serverless Function — GET /api/aws/sync/load/[userId]
// Load user's dietsync data snapshot from S3

import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: '`userId` is required.' });

  const BUCKET = process.env.S3_BUCKET_NAME;
  if (!BUCKET) return res.status(500).json({ error: 'S3_BUCKET_NAME not configured.' });

  try {
    // Check if file exists first
    try {
      await s3.send(new HeadObjectCommand({
        Bucket: BUCKET,
        Key: `dietsync-sync/${userId}/data.json`,
      }));
    } catch {
      return res.json({ success: true, data: null });
    }

    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `dietsync-sync/${userId}/data.json`,
    }));

    const body = await response.Body.transformToString();
    res.json({ success: true, data: JSON.parse(body) });
  } catch (err) {
    console.error('[S3 load]', err.message);
    res.status(500).json({ error: err.message });
  }
}
