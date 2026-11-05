// Vercel Serverless Function — POST /api/aws/sync/save
// Save user's dietsync data snapshot to S3

import {
  S3Client,
  PutObjectCommand,
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, data } = req.body;
  if (!userId || !data) {
    return res.status(400).json({ error: '`userId` and `data` are required.' });
  }

  const BUCKET = process.env.S3_BUCKET_NAME;
  if (!BUCKET) return res.status(500).json({ error: 'S3_BUCKET_NAME not configured.' });

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `dietsync-sync/${userId}/data.json`,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }));
    res.json({ success: true });
  } catch (err) {
    console.error('[S3 save]', err.message);
    res.status(500).json({ error: err.message });
  }
}
