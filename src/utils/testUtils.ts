/**
 * Mocks the environment variables for the duration of the test
 *
 * @param variables The variables to set
 */
export function mockEnvVariables(variables: Record<string, string | undefined>) {
  const oldEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [key, value] of Object.entries(variables)) {
      oldEnv[key] = process.env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  afterEach(() => {
    for (const key in variables) {
      process.env[key] = oldEnv[key];
    }
  });
}
