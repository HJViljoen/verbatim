import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // An underscore prefix is this repo's "deliberately unused" mark. Next's
  // default config has no ignore pattern, so a Server Action's required-but-
  // unused (_prev, _formData) pair warned forever and taught the team to read
  // past warnings — which is how a real one gets missed.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
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
    // The sales bundle: a standalone static demo (its own vendored JS), not
    // app code. 31 of the repo's 40 warnings came from it.
    "demo/**",
  ]),
]);

export default eslintConfig;
