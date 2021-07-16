import { CallbackParam, ViewSubmitActionParam } from './slackTypes';

export function isViewSubmitActionParam(
  callbackParam: CallbackParam,
): callbackParam is ViewSubmitActionParam {
  return callbackParam.body.type === 'view_submission';
}
