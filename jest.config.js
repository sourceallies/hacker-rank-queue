const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

process.env.TZ = 'America/Chicago';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['src', '.aws'],
  clearMocks: true,
  moduleNameMapper: {
    '^@utils/log$': '<rootDir>/src/utils/__mocks__/logMock.ts',
    // TSConfig Paths need to be last
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 75,
      statements: 70,
    },
  },
  coveragePathIgnorePatterns: ['src/utils/log.ts'],
};
