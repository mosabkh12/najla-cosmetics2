import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .vercel is the production build output (regenerated fresh by every
  // `npm run build`, never hand-edited) — it's excluded from the main
  // TS/TSX-scoped config below via `files`, but eslintPluginPrettier's
  // config block (bottom of this file) applies with no file-type
  // restriction of its own, so without this it was reachable by
  // `eslint .` and would try to prettier-diff every minified .js chunk
  // in there (some hundreds of KB on a single line) — correctness noise
  // against generated code, and pathologically slow (confirmed while
  // investigating a project-wide lint pass in Phase 9: over 15 minutes
  // and 1000+ findings against build output, none of them real).
  // supabase/.temp and supabase/.branches are local Supabase CLI
  // artifacts (generated fresh by `npx supabase start`, already
  // gitignored — see .gitignore) — not part of this project's source at
  // all. supabase/.temp/start-secrets/.../main/index.ts specifically is
  // the CLI's own Edge Runtime bootstrap script, accounting for 191 of
  // 217 findings in an unfiltered `eslint .` run (confirmed in Phase 9):
  // noise against code this project never wrote and can't fix.
  { ignores: ["dist", ".output", ".vinxi", ".vercel", "supabase/.temp", "supabase/.branches"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
