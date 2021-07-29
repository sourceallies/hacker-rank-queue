declare module 'lock' {
  type Release = () => () => void;
  type LockCallback = (release: Release) => void;
  type LockInstance = (key: string, callback: LockCallback) => void;
  export function Lock(): LockInstance;
}
