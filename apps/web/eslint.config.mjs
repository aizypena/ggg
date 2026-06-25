import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "src/generated/**",
      "src/contract-client/**",
      "src/components/ui/**",
      "e2e/**",
      "playwright.config.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default eslintConfig;
