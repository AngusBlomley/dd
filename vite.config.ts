/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// On GitHub Pages the site lives under /<repo>/; the deploy workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2022' },
  test: { environment: 'node' },
});
