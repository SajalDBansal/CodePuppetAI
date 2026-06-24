import globals from "globals"

import { config as baseConfig } from "@workspace/eslint-config/base"

export default [
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
]
