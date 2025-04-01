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
      branches: 55,
      functions: 70,
      lines: 75,
      statements: 75,
    },
  },
  coveragePathIgnorePatterns: ['src/utils/log.ts'],
};
