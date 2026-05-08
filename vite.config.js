import { defineConfig } from 'vite';

// IMPORTANT: change this to match your GitHub repo name.
// If your repo is github.com/santi/frc-auton-3d, this should be '/frc-auton-3d/'.
// If you serve from a custom domain or root, set this to '/'.
const REPO_NAME = '/frc-auton-3d/';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? REPO_NAME : '/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
