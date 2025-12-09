import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // URL de l'API PHP (même que poge-salaires)
  const phpApiUrl = env.VITE_PHP_API_URL || 'http://10.10.10.140:8081/php-api.php';
  const phpApiBase = phpApiUrl.replace(/\/php-api\.php$/, '');

  return {
    server: {
      host: '127.0.0.1',
      port: 3010, // Port différent de poge-salaires (3009)
      proxy: {
        '/api': {
          target: phpApiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
