import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'tests/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:ui', 'scope:data-access', 'scope:domain'],
            },
            { sourceTag: 'scope:ui', onlyDependOnLibsWithTags: ['scope:domain'] },
            { sourceTag: 'scope:data-access', onlyDependOnLibsWithTags: ['scope:domain'] },
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:domain'] },
            { sourceTag: 'scope:domain', onlyDependOnLibsWithTags: [] },
          ],
        },
      ],
    },
  },
  { files: ['**/*.spec.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  ...nx.configs['flat/base'],
];
