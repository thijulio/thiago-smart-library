import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'tests/fixtures/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.netlify/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{ts,tsx,vue}'],
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
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:domain', 'scope:database'],
            },
            { sourceTag: 'scope:database', onlyDependOnLibsWithTags: ['scope:domain'] },
            {
              sourceTag: 'scope:importer',
              onlyDependOnLibsWithTags: ['scope:database', 'scope:domain'],
            },
            { sourceTag: 'scope:domain', onlyDependOnLibsWithTags: [] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['apps/web/app/pages/**/*.vue', 'apps/web/app/app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'useHead',
          'defineNuxtConfig',
          'defineEventHandler',
          'toWebRequest',
          'setResponseHeader',
          'defineNuxtRouteMiddleware',
          'definePageMeta',
          'useRoute',
          'useState',
          'useLibrarySession',
          'ref',
          'computed',
          'onMounted',
          'watch',
          'navigateTo',
          'clearNuxtData',
          'useFetch',
          '$fetch',
          'defineProps',
          'defineEmits',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
  {
    files: ['apps/web/app/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/server/**',
                '@smart-library/database',
                '@smart-library/database/*',
                '@smart-library/importer',
                '@smart-library/importer/*',
                '@neondatabase/serverless',
                'pg',
                'kysely',
                'ws',
                'better-auth',
                'better-auth/node',
              ],
              message: 'Browser code must use private HTTP APIs, never server modules.',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.integration.spec.ts'], rules: { '@nx/enforce-module-boundaries': 'off' } },
  { files: ['**/*.spec.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  ...nx.configs['flat/base'],
];
