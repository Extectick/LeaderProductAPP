#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

async function main() {
  const filePath = process.argv[2];
  const key = process.argv[3];

  if (!filePath || !key) {
    throw new Error('Usage: node scripts/uploadApkToS3.js <apk-path> <s3-key>');
  }

  const absolutePath = path.resolve(filePath);
  const body = fs.readFileSync(absolutePath);

  const client = new S3Client({
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: requiredEnv('S3_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: requiredEnv('S3_BUCKET'),
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: 'application/vnd.android.package-archive',
    })
  );

  console.log(`Uploaded ${absolutePath} to s3://${process.env.S3_BUCKET}/${key}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
