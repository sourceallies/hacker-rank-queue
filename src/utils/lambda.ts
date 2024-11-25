import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

/**
 * Invokes a Lambda function with the given event
 */
export async function invokeLambda(functionName: string, event: object) {
  const client = new LambdaClient();

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(event),
  });

  return await client.send(command);
}
