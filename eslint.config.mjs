import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees live inside the repo (.claude/worktrees/<agent>/) and
    // carry their own node_modules; linting them doubles every warning and
    // adds thousands of errors from vendored code (found 2026-09-09).
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
