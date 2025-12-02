const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['src', '.aws'],
  clearMocks: true,
  moduleNameMapper: {
    '^@utils/log$': '<rootDir>/src/utils/__mocks__/logMock.ts',
    '^google-spreadsheet$': '<rootDir>/src/__mocks__/google-spreadsheet.ts',
    '^google-auth-library$': '<rootDir>/src/__mocks__/google-auth-library.ts',
    // TSConfig Paths need to be last
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 75,
      lines: 80,
      statements: 75,
    },
  },
  coveragePathIgnorePatterns: ['src/utils/log.ts'],
};
