import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function putPdfToS3(objectKey: string, pdf: any) {
  const client = new S3Client({ region: 'us-east-1' }); // TODO: No-no with statically assigned region

  const command = new PutObjectCommand({
    Bucket: 'hack-parser-dev',
    Key: objectKey,
    Body: pdf,
  });

  await client.send(command);
}

export async function generatePresignedUrl(objectKey: string) {
  const client = new S3Client({ region: 'us-east-1' }); // TODO: No-no with statically assigned region

  const command = new GetObjectCommand({
    Bucket: 'hack-parser-dev',
    Key: objectKey,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 }); // URL expires in 1 hour

  return signedUrl;
}
