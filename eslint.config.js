// ESLint (flat config) : TypeScript recommande + regles de React Hooks pour le
// renderer. Les regles qui exigent des informations de types (no-floating-
// promises...) sont volontairement absentes : `tsc --strict` couvre l'essentiel.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.vitest/**', 'test/scratch/**', 'test/verif/**', 'apps/figma-plugin/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Page GitHub Pages : script navigateur.
    files: ['site/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Script Electron en CommonJS (npx electron scripts/render-svg.cjs).
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Le parcours Playwright passe des fonctions au navigateur (page.evaluate).
    files: ['**/*.mjs', 'test/e2e/**'],
    languageOptions: { globals: { ...globals.browser } },
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
)
