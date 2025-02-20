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

  it('should throw an error if the Lambda response is invalid', async () => {
    (invokeLambda as jest.Mock).mockResolvedValue({ Payload: 'invalid_json' });

    await expect(generateHackParserPresignedURL('file3.txt')).rejects.toThrow();
  });
});
