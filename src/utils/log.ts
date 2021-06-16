/* eslint-disable @typescript-eslint/no-explicit-any */
const log = {
  d(fn: string, ...params: any[]): void {
    console.log(`[DEBUG | ${fn}]`, ...params);
  },
  w(fn: string, ...params: any[]): void {
    console.warn(`[WARN | ${fn}]`, ...params);
  },
  e(fn: string, ...params: any[]): void {
    console.error(`[ERROR | ${fn}]`, ...params);
  },
};

export default log;
