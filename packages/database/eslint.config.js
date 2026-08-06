import globals from "globals"

import { config as baseConfig } from "@workspace/eslint-config/base"

export default [
  ...baseConfig,
  {
    files: ["src/**/*.ts", "prisma.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: ["generated/**"],
  },
]
