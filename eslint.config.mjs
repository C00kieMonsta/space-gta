import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

export default ts.config(
  {
    ignores: [
      "client/**",
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-empty-function": "off",
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" }
  }
);
