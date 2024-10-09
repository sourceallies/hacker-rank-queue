import { generateS3PresignedUrl, listKeysWithPrefixWithinS3, uploadFileToS3 } from '@/utils/s3';

/**
 * Returns whether the HackParser integration is enabled
 */
export function HackParserIntegrationEnabled() {
  return !!process.env.HACK_PARSER_BUCKET_NAME;
}

/**
 * Generates a presigned URL for a HackParser S3 object; lasts for 2 days
 */
export function generateHackParserPresignedURL(key: string) {
  return generateS3PresignedUrl(process.env.HACK_PARSER_BUCKET_NAME!, key, 3600 * 24 * 2);
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
