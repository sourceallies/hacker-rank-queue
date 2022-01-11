import { determineExpirationTime } from '@utils/reviewExpirationUtils';

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

  function verifyDate(date: Date, month: number, dayOfMonth: number, hour: number, year: number) {
    expect(date.getMonth()).toBe(month);
    expect(date.getDate()).toBe(dayOfMonth);
    expect(date.getHours()).toBe(hour);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getFullYear()).toBe(year);
  }
});
