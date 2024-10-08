import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

export async function putPdfToS3(objectKey: string, pdf: Buffer) {
  const client = new S3Client();

  const command = new PutObjectCommand({
    Bucket: process.env.HACK_PARSER_BUCKET_NAME!,
    Key: objectKey,
    Body: pdf,
  });

  await client.send(command);
}

export async function generatePresignedUrl(objectKey: string) {
  const client = new S3Client();

  const command = new GetObjectCommand({
    Bucket: process.env.HACK_PARSER_BUCKET_NAME!,
    Key: objectKey,
  });

  return await getSignedUrl(client, command, { expiresIn: 3600 * 24 * 2 }); // URL expires in 2 days
}

export async function getKeysWithinDirectory(directory: string) {
  const client = new S3Client();

  const command = new ListObjectsV2Command({
    Bucket: process.env.HACK_PARSER_BUCKET_NAME!,
    Prefix: directory,
  });

  const response = await client.send(command);
  return response.Contents?.map(content => content.Key!) ?? [];
}
