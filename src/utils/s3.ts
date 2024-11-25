import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Uploads a file to S3
 */
export async function uploadFileToS3(
  Bucket: string,
  Key: string,
  Body: Exclude<ConstructorParameters<typeof PutObjectCommand>[0]['Body'], undefined>,
) {
  const client = new S3Client();

  const command = new PutObjectCommand({
    Bucket,
    Key,
    Body,
  });

  await client.send(command);
}

/**
 * Lists all keys within an S3 bucket that have a given prefix
 */
export async function listKeysWithPrefixWithinS3(Bucket: string, Prefix: string) {
  const client = new S3Client();

  const command = new ListObjectsV2Command({
    Bucket,
    Prefix,
  });

  const response = await client.send(command);
  return response.Contents?.map(content => content.Key!) ?? [];
}
