import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  apiUrl: async ({}, use) => {
    const url = process.env.TEST_API_URL || 'http://127.0.0.1:8765';
    await use(url);
  },
});

export { expect };
