const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

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
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5,
    },
  },
  coveragePathIgnorePatterns: ['src/utils/log.ts'],
};
