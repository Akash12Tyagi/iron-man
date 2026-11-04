import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js and the sets load in their own lazily imported chunks.
    chunkSizeWarningLimit: 700,
  },
})
