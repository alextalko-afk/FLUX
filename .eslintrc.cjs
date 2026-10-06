/**
 * Root ESLint configuration.
 *
 * Every workspace package runs `eslint` from its own directory, and ESLint walks
 * up the tree until it finds a config. Keeping a single `root: true` config here
 * means the rules cannot drift apart across six packages, and packages that had
 * a `lint` script but no configuration (web, mobile, shared) start working.
 *
 * The rule set is deliberately pragmatic for a TypeScript monorepo: the
 * `@typescript-eslint/recommended` baseline is enabled, while rules that would
 * only flag deliberate, working code are relaxed. Formatting is delegated to
 * Prettier via `eslint-config-prettier`.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  // `no-undef` is a JavaScript-only check; TypeScript already reports undefined
  // identifiers during type-checking, and the rule produces false positives for
  // type-only globals.
  env: { es2022: true, node: true },
  ignorePatterns: [
    '**/dist/**',
    '**/build/**',
    '**/release/**',
    '**/.expo/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/*.config.js',
    '**/*.config.cjs',
    '**/prisma/migrations/**',
  ],
  rules: {
    'no-undef': 'off',
    // These escape hatches are used intentionally throughout the codebase
    // (Prisma dynamic `where` builders, WebRTC browser typings, Electron).
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    // Unused values are a warning rather than a build error so that
    // work-in-progress branches stay lintable; real dead code is still visible.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'react-hooks/exhaustive-deps': 'warn',
  },
};
