import { invokeLambda } from '@/utils/lambda';
import { listKeysWithPrefixWithinS3, uploadFileToS3 } from '@/utils/s3';

const S3_PRESIGNED_URL_EXPIRATION = 3600 * 24 * 7;

/**
 * Returns whether the HackParser integration is enabled
 */
export function HackParserIntegrationEnabled() {
  return (
    !!process.env.HACK_PARSER_BUCKET_NAME && !!process.env.HACK_PARSER_URL_GENERATOR_FUNCTION_NAME
  );
}

/**
 * Invokes the S3 presigned URL generator Lambda function and returns the generated URLs
 */
async function invokeS3PresignedURLGeneratorLambda(
  requests: { key: string; expiration?: number }[],
  expiration?: number,
): Promise<Record<string, string>> {
  const result = await invokeLambda(process.env.HACK_PARSER_URL_GENERATOR_FUNCTION_NAME!, {
    expiration,
    requests,
  });
  const response = JSON.parse(result.Payload!.toString());
  return response;
}

/**
 * Generates a presigned URL for a HackParser S3 object; lasts for 7 days
 */
export async function generateHackParserPresignedURL(key: string) {
  const urls = await invokeS3PresignedURLGeneratorLambda([
    { key, expiration: S3_PRESIGNED_URL_EXPIRATION },
  ]);
  return urls[key];
}

/**
 * Uploads a PDF to the HackParser S3 bucket
 */
export async function uploadPFDToHackParserS3(filename: string, body: Buffer) {
  return await uploadFileToS3(process.env.HACK_PARSER_BUCKET_NAME!, filename, body);
}

/**
 * Lists all code keys within the HackParser S3 bucket for a given PDF identifier
 */
export async function listHackParserCodeKeys(pdfIdentifier: string) {
  const directoryKey = pdfIdentifier.replace(/\.pdf$/, '') + '/';
  const keys = await listKeysWithPrefixWithinS3(process.env.HACK_PARSER_BUCKET_NAME!, directoryKey);
  return keys.filter(key => key !== directoryKey + 'results.json');
}
