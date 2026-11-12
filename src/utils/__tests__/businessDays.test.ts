import { determineCloseTime, requestCloseBusinessDays } from '@utils/businessDays';

describe('business days', () => {
  const OLD_ENV = process.env;

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.WORKDAY_START_HOUR = '8';
    process.env.WORKDAY_END_HOUR = '17';
    delete process.env.REQUEST_CLOSE_BUSINESS_DAYS;
  });

  describe('determineCloseTime', () => {
    // January 2022: Mon 3, Thu 6, Fri 7, Sat 8, Mon 10, Tue 11
    it.each([
      [
        'Thursday 3pm closes Friday 3pm',
        new Date(2022, 0, 6, 15, 0),
        1,
        new Date(2022, 0, 7, 15, 0),
      ],
      [
        'Friday 3pm closes Monday 3pm',
        new Date(2022, 0, 7, 15, 0),
        1,
        new Date(2022, 0, 10, 15, 0),
      ],
      ['8:30am counts from 8:30am', new Date(2022, 0, 3, 8, 30), 1, new Date(2022, 0, 4, 8, 30)],
      ['before hours counts from 8am', new Date(2022, 0, 3, 6, 0), 1, new Date(2022, 0, 4, 8, 0)],
      [
        'after hours counts from next 8am',
        new Date(2022, 0, 6, 19, 0),
        1,
        new Date(2022, 0, 10, 8, 0),
      ],
      [
        '5pm sharp counts from next 8am',
        new Date(2022, 0, 3, 17, 0),
        1,
        new Date(2022, 0, 5, 8, 0),
      ],
      [
        'Saturday counts from Monday 8am',
        new Date(2022, 0, 8, 10, 0),
        1,
        new Date(2022, 0, 11, 8, 0),
      ],
      [
        '2 days from Thursday skips the weekend',
        new Date(2022, 0, 6, 15, 0),
        2,
        new Date(2022, 0, 10, 15, 0),
      ],
      ['crosses a month boundary', new Date(2022, 0, 31, 10, 0), 1, new Date(2022, 1, 1, 10, 0)],
    ])('%s', (_name, requestedAt, days, expected) => {
      expect(new Date(determineCloseTime(requestedAt, days))).toEqual(expected);
    });

    it('reads the number of days from REQUEST_CLOSE_BUSINESS_DAYS', () => {
      process.env.REQUEST_CLOSE_BUSINESS_DAYS = '2';
      expect(determineCloseTime(new Date(2022, 0, 6, 15, 0))).toBe(
        new Date(2022, 0, 10, 15, 0).getTime(),
      );
    });
  });

  describe('requestCloseBusinessDays', () => {
    it.each([
      [undefined, 1],
      ['', 1],
      ['abc', 1],
      ['0', 1],
      ['1.5', 1],
      ['3', 3],
    ])('%p reads as %p', (value, expected) => {
      if (value === undefined) delete process.env.REQUEST_CLOSE_BUSINESS_DAYS;
      else process.env.REQUEST_CLOSE_BUSINESS_DAYS = value;
      expect(requestCloseBusinessDays()).toBe(expected);
    });
  });
});
