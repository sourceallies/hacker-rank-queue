import { invokeLambda } from '@/utils/lambda';
import { listKeysWithPrefixWithinS3, uploadFileToS3 } from '@/utils/s3';
import log from '@utils/log';

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

  if (!result.Payload) {
    log.e('Error: No payload on lambda response');
    return {};
  }

  let payload: unknown = result.Payload;

  if (payload instanceof Uint8Array) {
    payload = new TextDecoder().decode(payload);
  }

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      log.e('Error parsing payload as JSON:', error);
      throw new Error('Invalid JSON response from Lambda');
    }
  }

  if (Array.isArray(payload) && payload.every(num => typeof num === 'number')) {
    const asciiArray = payload as number[];
    const decoded = String.fromCharCode(...asciiArray);

    log.e('Decoded Payload: ' + decoded);

    try {
      return JSON.parse(decoded);
    } catch (error) {
      log.e('Error parsing decoded payload:', error);
      throw new Error('Invalid JSON structure after decoding');
    }
  }

  if (typeof payload === 'object' && payload !== null) {
    return payload as Record<string, string>;
  }

  log.e('Error: Unexpected payload format');
  throw new Error('Unexpected payload format');
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
export async function uploadPDFToHackParserS3(filename: string, body: Buffer) {
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
