import { generateHackParserPresignedURL } from '../HackParserService';
import { invokeLambda } from '@utils/lambda';

jest.mock('@utils/lambda', () => ({
  invokeLambda: jest.fn(),
}));

describe('generateHackParserPresignedURL', () => {
  process.env.HACK_PARSER_URL_GENERATOR_FUNCTION_NAME = 'mockLambdaFunction';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a presigned URL for a given key', async () => {
    const key = 'file1.txt';
    const mockResponse = { 'file1.txt': 'https://mock-url-1' };
    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: JSON.stringify(mockResponse) });

    const result = await generateHackParserPresignedURL(key);

    expect(result).toEqual('https://mock-url-1');
  });

  it('should return undefined if the response does not contain the key', async () => {
    const key = 'file2.txt';
    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: JSON.stringify({}) });

    const result = await generateHackParserPresignedURL(key);
    expect(result).toBeUndefined();
  });

  it('should throw an error if the Lambda response is invalid JSON', async () => {
    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: 'invalid_json' });

    await expect(generateHackParserPresignedURL('file3.txt')).rejects.toThrow();
  });

  it('should decode ASCII-encoded payload and return a valid presigned URL', async () => {
    const key = 'file4.txt';
    const asciiPayload = JSON.stringify([
      123, 34, 102, 105, 108, 101, 52, 46, 116, 120, 116, 34, 58, 32, 34, 104, 116, 116, 112, 115,
      58, 47, 47, 109, 111, 99, 107, 45, 117, 114, 108, 45, 52, 34, 125,
    ]);

    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: asciiPayload });

    const result = await generateHackParserPresignedURL(key);

    expect(result).toEqual('https://mock-url-4');
  });

  it('should handle Uint8ArrayBlobAdapter payload correctly', async () => {
    const key = 'file5.txt';
    const mockResponse = { 'file5.txt': 'https://mock-url-5' };
    const uint8ArrayPayload = new TextEncoder().encode(JSON.stringify(mockResponse));

    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: uint8ArrayPayload });

    const result = await generateHackParserPresignedURL(key);
    expect(result).toEqual('https://mock-url-5');
  });

  it('should return undefined if Payload is undefined', async () => {
    const key = 'file6.txt';
    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: undefined });

    const result = await generateHackParserPresignedURL(key);
    expect(result).toBeUndefined();
  });

  it('should handle empty Lambda response gracefully', async () => {
    const key = 'file8.txt';
    (invokeLambda as jest.Mock).mockResolvedValue({});

    const result = await generateHackParserPresignedURL(key);
    expect(result).toBeUndefined();
  });
});
