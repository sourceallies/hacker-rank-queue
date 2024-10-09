import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

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
 * Generates a presigned URL for an S3 object
 *
 * @param expiresIn How long in seconds the URL should be valid for
 */
export async function generateS3PresignedUrl(Bucket: string, Key: string, expiresIn: number) {
  const client = new S3Client();

  const command = new GetObjectCommand({
    Bucket,
    Key,
  });

  return await getSignedUrl(client, command, { expiresIn });
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
