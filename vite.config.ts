import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served from peterjur.co/koalka/ — the Worker matches assets by full request
  // path, so the build output is nested to mirror the route.
  base: '/koalka/',
  build: { outDir: 'dist/koalka' },
})
