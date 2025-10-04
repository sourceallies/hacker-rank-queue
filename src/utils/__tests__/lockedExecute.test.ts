import { Lock } from 'lock';
import { lockedExecute } from '../lockedExecute';

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

describe('Locked Executor', () => {
  it('should return the value that the executor function returns', async () => {
    const lock = Lock();
    const expected = 'expected';
    const executor = () => Promise.resolve(expected);

    const actual = await lockedExecute(lock, executor);
    expect(actual).toEqual(expected);
  });

  it('should not run two executions at the same time using the same lock', async () => {
    const lock = Lock();
    const start = jest.fn();
    const end = jest.fn();
    const executionTime = 500;
    const executor = async () => {
      start();
      await sleep(executionTime);
      end();
    };

    const execution1 = lockedExecute(lock, executor);
    const execution2 = lockedExecute(lock, executor);

    await sleep(executionTime / 2);
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(0);

    await sleep(executionTime);
    expect(start).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(1);

    await sleep(executionTime);
    expect(start).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);

    await Promise.all([execution1, execution2]);
  });

  it('should run two executions at the same time using different locks', async () => {
    const lock1 = Lock();
    const lock2 = Lock();
    const start = jest.fn();
    const end = jest.fn();
    const executionTime = 500;
    const executor = async () => {
      start();
      await sleep(executionTime);
      end();
    };

    const execution1 = lockedExecute(lock1, executor);
    const execution2 = lockedExecute(lock2, executor);

    await sleep(executionTime / 2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(0);

    await sleep(executionTime);
    expect(start).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);

    await Promise.all([execution1, execution2]);
  });

  it('should release the lock when there is a failure', async () => {
    const lock = Lock();
    const executor1 = async () => Promise.reject('test error');
    const executor2 = jest.fn().mockResolvedValue(undefined);

    try {
      await lockedExecute(lock, executor1);
    } catch (err) {
      expect(err).toEqual('test error');
    }
    await lockedExecute(lock, executor2);

    expect(executor2).toHaveBeenCalled();
  });
});
