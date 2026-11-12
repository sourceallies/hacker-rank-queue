import {
  determineCloseTime,
  determineExpirationTime,
  requestCloseBusinessDays,
} from '@utils/reviewExpirationUtils';

describe('Review Expiration', () => {
  const OLD_ENV = process.env;

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.REQUEST_EXPIRATION_MIN = '60';
    process.env.WORKDAY_START_HOUR = '8';
    process.env.WORKDAY_END_HOUR = '17';
    delete process.env.REQUEST_CLOSE_BUSINESS_DAYS;
  });

  it('should pick a time starting on the next working day if would expire after 5 PM', () => {
    // Monday, January 17th, 2022 at 4:30 PM
    const date = new Date(2022, 0, 17, 16, 30, 0);

    const expirationDate = new Date(determineExpirationTime(date));

    // Tuesday, January 18th, 2022 at 9:00 AM
    verifyDate(expirationDate, 0, 18, 9, 2022);
  });

  it('should pick a time starting on the next working day if would expire before 8 AM', () => {
    // Monday, January 3rd, 2022 at 5:00 AM
    const date = new Date(2022, 0, 3, 5, 0, 0);

    const expirationDate = new Date(determineExpirationTime(date));

    // Monday, January 3rd, 2022 at 9:00 AM
    verifyDate(expirationDate, 0, 3, 9, 2022);
  });

  it('should pick a time on the next Monday if it would expire on the weekend', () => {
    // Saturday, January 1st, 2022 at 8:15 AM
    const date = new Date(2022, 0, 1, 8, 15, 0);

    const expirationDate = new Date(determineExpirationTime(date));

    // Monday, January 3rd, 2022 at 9:00 AM
    verifyDate(expirationDate, 0, 3, 9, 2022);
  });

  it('should handle new months correctly', () => {
    // Monday, January 31st, 2022 at 8:15 PM
    const date = new Date(2022, 0, 31, 20, 15, 0);

    const expirationDate = new Date(determineExpirationTime(date));

    // Tuesday, February 1st, 2022 at 9:00 AM
    verifyDate(expirationDate, 1, 1, 9, 2022);
  });

  it('should pick a time 1 hour from now if it falls between 8-5 M-F', () => {
    // Monday, January 3rd, 2022 at 10:00 AM
    const date = new Date(2022, 0, 3, 10, 0, 0);

    const expirationDate = new Date(determineExpirationTime(date));

    // Monday, January 3rd, 2022 at 11:00 AM
    verifyDate(expirationDate, 0, 3, 11, 2022);
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

  function verifyDate(date: Date, month: number, dayOfMonth: number, hour: number, year: number) {
    expect(date.getMonth()).toBe(month);
    expect(date.getDate()).toBe(dayOfMonth);
    expect(date.getHours()).toBe(hour);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getFullYear()).toBe(year);
  }
});
