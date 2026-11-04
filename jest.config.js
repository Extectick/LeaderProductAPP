const common = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: 'native',
      preset: 'jest-expo',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.unit.test.ts'],
      testPathIgnorePatterns: ['/(webClipboard|draftItemsTableFeatures).unit.test.ts$'],
    },
    {
      ...common,
      displayName: 'web',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/webClipboard.unit.test.ts', '**/__tests__/draftItemsTableFeatures.unit.test.ts'],
      transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
      transformIgnorePatterns: ['node_modules/(?!(@tanstack/(react-table|table-core|react-store|store)|use-sync-external-store)/)'],
    },
  ],
};
