import { threadRecords } from '../ThreadRecords';

interface Counter {
  threadId: string;
  value: number;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('threadRecords', () => {
  let stored: Map<string, Counter>;
  const load = async (threadId: string) => {
    const record = stored.get(threadId);
    return record && { ...record };
  };
  const save = async (record: Counter) => {
    stored.set(record.threadId, { ...record });
  };

  beforeEach(() => {
    stored = new Map([
      ['a', { threadId: 'a', value: 0 }],
      ['b', { threadId: 'b', value: 0 }],
    ]);
  });

  it('gives each change a fresh read, so concurrent changes to one thread both land', async () => {
    const records = threadRecords('test', load);
    const slow = deferred();

    const first = records.withRecord('a', async record => {
      await slow.promise;
      await save({ ...record, value: record.value + 1 });
    });
    const second = records.withRecord('a', async record => {
      await save({ ...record, value: record.value + 1 });
    });

    await flush();
    slow.resolve();
    await Promise.all([first, second]);

    expect(stored.get('a')!.value).toBe(2);
  });

  it('does not make different threads wait on each other', async () => {
    const records = threadRecords('test', load);
    const slow = deferred();

    const blocked = records.withRecord('a', () => slow.promise);
    const other = await records.withRecord('b', async record => record.threadId);

    expect(other).toBe('b');
    slow.resolve();
    await blocked;
  });

  it('returns what the change returns', async () => {
    const records = threadRecords('test', load);

    await expect(records.withRecord('a', async record => record.value + 41)).resolves.toBe(41);
  });

  it('runs onGone instead of the change when the record no longer exists', async () => {
    const records = threadRecords('test', load);
    const change = jest.fn();

    const result = await records.withRecord('missing', change, async () => 'gone');

    expect(change).not.toHaveBeenCalled();
    expect(result).toBe('gone');
  });

  it('resolves to undefined when the record is gone and there is no onGone', async () => {
    const records = threadRecords('test', load);

    await expect(records.withRecord('missing', jest.fn())).resolves.toBeUndefined();
  });

  it('sees a removal made by the change ahead of it', async () => {
    const records = threadRecords('test', load);
    const onGone = jest.fn().mockResolvedValue(undefined);

    await Promise.all([
      records.withRecord('a', async () => {
        stored.delete('a');
      }),
      records.withRecord('a', jest.fn(), onGone),
    ]);

    expect(onGone).toHaveBeenCalled();
  });

  it('drops a thread lock once nobody holds or waits on it, even after errors', async () => {
    const records = threadRecords('test', load);
    const slow = deferred();

    const first = records.withRecord('a', () => slow.promise);
    const second = records.withRecord('a', async () => {
      throw new Error('boom');
    });
    expect(records.lockedThreadCount()).toBe(1);

    slow.resolve();
    await first;
    await expect(second).rejects.toThrow('boom');

    expect(records.lockedThreadCount()).toBe(0);
  });
});
