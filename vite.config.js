import { defineConfig } from 'vite';

export default defineConfig({
  // Indica a Vite que busque el archivo .env dentro de la carpeta functions
  envDir: './functions',
  server: {
    port: 3000,
    open: true
  },
  root: './',
  build: {
    outDir: 'dist',
  }
});