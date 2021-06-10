import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { HackerRankQueueStack } from '../lib/HackerRankQueueStack';

const app = new cdk.App();

/**
 * Return a context variable with an optional fallback
 *
 * @param context The context variable name set in `cdk.json` or with `-c` on the cli
 * @param fallback A fallback value if none are found
 * @returns The context value or the fallback if the value is not found. If a fallback was not
 *          provided and a variable is not found, it will throw an error.
 */
function ctx(context: string, fallback?: any): any {
  const value = app.node.tryGetContext(context) ?? fallback;
  if (value == null) {
    throw Error(`[${context}] is a required context variable`);
  }
  return value;
}

const mode = ctx('mode', 'dev');
const modeConfig = ctx(mode);

new HackerRankQueueStack(app, 'HackerRankQueueStack', {
  env: {
    region: modeConfig.REGION,
    account: modeConfig.ACCOUNT_NUMBER,
  },
  mode,
  environment: {
    SPREADSHEET_ID: modeConfig.SPREADSHEET_ID,
  },
});