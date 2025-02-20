import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { uploadFileToS3, listKeysWithPrefixWithinS3 } from '../s3';

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn(),
    PutObjectCommand: jest.fn(),
    ListObjectsV2Command: jest.fn(),
  };
});

describe('S3', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFileToS3', () => {
    it('should upload a file to S3 successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(uploadFileToS3('test-bucket', 'test-key', 'test-body')).resolves.not.toThrow();

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-key',
        Body: 'test-body',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if upload fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(uploadFileToS3('test-bucket', 'test-key', 'test-body')).rejects.toThrow(
        'Upload failed',
      );
    });
  });

  describe('listKeysWithPrefixWithinS3', () => {
    it('should return list of keys from S3', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'test-key-1' }, { Key: 'test-key-2' }],
      });

      await expect(listKeysWithPrefixWithinS3('test-bucket', 'test-prefix')).resolves.toEqual([
        'test-key-1',
        'test-key-2',
      ]);

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Prefix: 'test-prefix',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array if no contents are found', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(listKeysWithPrefixWithinS3('test-bucket', 'test-prefix')).resolves.toEqual([]);
    });

    it('should throw an error if listing fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Listing failed'));

      await expect(listKeysWithPrefixWithinS3('test-bucket', 'test-prefix')).rejects.toThrow(
        'Listing failed',
      );
    });
  });
});
