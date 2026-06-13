/** @type {import('@eslint/eslintrc')} */
module.exports = {
  root: true,
  extends: ["eslint:recommended"],
  plugins: [],
  env: {
    browser: true,
    commonjs: true,
    es2022: true,
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": "warn",
  },
};
