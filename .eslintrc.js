module.exports = {
  env: {
    browser: true,
    es6: true,
    mocha: true,
  },
  extends: [
    'airbnb-base'
  ],
  overrides: [],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: "@babel/eslint-parser",
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: {
      plugins: [
        '@babel/plugin-syntax-import-assertions'
      ],
    },
  },
  rules: {
    'function-paren-newline': 0,
    'implicit-arrow-linebreak': 0,
    'import/extensions': 0,
    'max-classes-per-file': 0,
    'no-async-promise-executor': 0,
    'no-console': 0,
    'no-underscore-dangle': 0,
    'no-use-before-define': 0,
    'object-curly-newline': 0,
    'operator-linebreak': 0,
    'no-multi-assign': 0,
  },
};
