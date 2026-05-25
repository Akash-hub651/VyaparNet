/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require('./index.js'),
  rules: {
    ...require('./index.js').rules,
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
  },
};
