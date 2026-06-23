#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function upload(client, bucket, file) {
  const body = fs.readFileSync(path.resolve(file.localPath));
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: file.key,
      Body: body,
      ContentLength: body.length,
      ContentType: file.contentType || 'application/octet-stream',
    })
  );
  console.log(`Uploaded ${file.key}`);
}

async function main() {
  const metadataPath = process.argv[2];
  if (!metadataPath) {
    throw new Error('Usage: node scripts/uploadOtaToS3.js <ota-metadata.json>');
  }

  const metadata = JSON.parse(fs.readFileSync(path.resolve(metadataPath), 'utf8'));
  const bucket = requiredEnv('S3_BUCKET');
  const client = new S3Client({
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: requiredEnv('S3_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });

  for (const file of metadata.files || []) {
    await upload(client, bucket, file);
  }

  const manifestBody = Buffer.from(JSON.stringify(metadata, null, 2));
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadata.manifestKey,
      Body: manifestBody,
      ContentLength: manifestBody.length,
      ContentType: 'application/json',
    })
  );
  console.log(`Uploaded ${metadata.manifestKey}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
