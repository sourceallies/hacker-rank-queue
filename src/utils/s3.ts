import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export async function generatePresignedUrl(objectKey: string) {
  const client = new S3Client({ region: 'us-east-1' }); // TODO: No-no with statically assigned region

  const command = new GetObjectCommand({
    Bucket: 'hack-parser-dev',
    Key: objectKey,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 }); // URL expires in 1 hour

  return signedUrl;
}
