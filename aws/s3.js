// ─────────────────────────────────────────────────────────────────────────────
// DietSync — S3 helper
// Handles saving and loading a user's full dietsync data as a single JSON
// file in S3. Key pattern: dietsync-sync/{userId}/data.json
// ─────────────────────────────────────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-southeast-2' });
const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Save all dietsync localStorage keys for a user as a single JSON to S3.
 * Called by POST /api/sync/save
 */
export async function saveUserData(userId, data) {
  if (!BUCKET) throw new Error('S3_BUCKET_NAME is not set in .env');

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `dietsync-sync/${userId}/data.json`,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })
  );
}

/**
 * Load a user's dietsync data from S3.
 * Returns null if no data exists yet (first login on new device).
 * Called by GET /api/sync/load/:userId
 */
export async function loadUserData(userId) {
  if (!BUCKET) throw new Error('S3_BUCKET_NAME is not set in .env');

  // Check if the file exists first to avoid throwing on new users
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: `dietsync-sync/${userId}/data.json`,
      })
    );
  } catch {
    return null; // no data saved yet for this user
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: `dietsync-sync/${userId}/data.json`,
    })
  );

  const body = await response.Body.transformToString();
  return JSON.parse(body);
}
