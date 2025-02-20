import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { invokeLambda } from '../lambda';

jest.mock('@aws-sdk/client-lambda', () => {
  const sendMock = jest.fn();
  return {
    LambdaClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
    InvokeCommand: jest.fn().mockImplementation(params => params),
  };
});

describe('invokeLambda', () => {
  let sendMock: jest.Mock;
  let clientInstance: LambdaClient;

  beforeEach(() => {
    clientInstance = new LambdaClient();
    sendMock = clientInstance.send as jest.Mock;
  });

  it('should invoke Lambda function with correct parameters', async () => {
    sendMock.mockResolvedValue({
      StatusCode: 200,
      Payload: JSON.stringify({ message: 'Success' }),
    });

    const functionName = 'testFunction';
    const event = { key: 'value' };

    const response = await invokeLambda(functionName, event);

    expect(InvokeCommand).toHaveBeenCalledWith({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(event),
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ FunctionName: functionName }));
    expect(response).toEqual({ StatusCode: 200, Payload: JSON.stringify({ message: 'Success' }) });
  });

  it('should handle errors when invoking Lambda', async () => {
    sendMock.mockRejectedValue(new Error('Lambda invocation failed'));

    await expect(invokeLambda('testFunction', { key: 'value' })).rejects.toThrow(
      'Lambda invocation failed',
    );
  });
});
