const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['src', '.aws'],
  clearMocks: true,
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@utils/log$': '<rootDir>/src/utils/__mocks__/logMock.ts',
    // TSConfig Paths need to be last
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  },
};
