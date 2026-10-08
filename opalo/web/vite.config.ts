import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode demo` genera una versión estática sin backend (rutas con #) para vista previa.
// `--mode medir` (npm run build:medir) compila con variables de Supabase de ejemplo (.env.medir)
// para medir el paquete que de verdad se publica: sin variables, el adaptador de Supabase se
// elimina al compilar y `npm run build` reporta un tamaño menor al real.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const conSupabase = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  return {
    plugins: [react()],
    base: mode === 'demo' ? './' : '/',
    server: { fs: { allow: ['..'] } },
    build: {
      rollupOptions: {
        output: {
          // Librerías aparte: cambian poco, así el navegador las conserva en caché entre versiones del sitio.
          // supabase-js sólo existe en el paquete cuando hay variables de Supabase.
          manualChunks(id: string) {
            if (!id.includes('/node_modules/')) return undefined;
            if (id.includes('/node_modules/@supabase/')) return conSupabase ? 'supabase' : undefined;
            if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|@remix-run|scheduler)\//.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
    test: { environment: 'jsdom' },
  };
});
