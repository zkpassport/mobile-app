// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  plugins: ["prettier", "react-hooks", "react-perf", "unused-imports"],
  rules: {
    // Enforce Prettier rules
    "prettier/prettier": "error",
    // Enforce the use of === instead of ==
    "eqeqeq": "error",
    // Enforce comments to be spaced
    "spaced-comment": ["error", "always"],
    // Warns if you forget useCallback/useMemo/useEffect deps
    // TODO: Once linting is fixed, make this an error
    "react-hooks/exhaustive-deps": "off",
    // Enforce no unused imports
    "unused-imports/no-unused-imports": "error",
    // Enforce no unused expressions
    "no-unused-expressions": "error",
    // Enforce no unused vars
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    // TODO: Consider enabling these
    // Warns when inline functions should be memoized
    // "react-perf/jsx-no-new-function-as-prop": "error",
    // Warns when inline objects should be memoized
    // "react-perf/jsx-no-new-object-as-prop": "error",
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
}
