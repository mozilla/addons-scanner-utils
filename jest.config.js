export default {
  preset: 'ts-jest',
  moduleNameMapper: {
    // Replace imports ending with `.js` with imports without extensions.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
};
