import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".local/**",
      ".venv/**",
      ".mypy_cache/**",
      ".ruff_cache/**",
      ".pnpm-store/**",
    ],
  },
];

export default eslintConfig;
