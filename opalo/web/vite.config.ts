import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode demo` genera una versión estática sin backend (rutas con #) para vista previa.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? './' : '/',
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom' },
}));
