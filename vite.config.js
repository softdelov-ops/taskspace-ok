import { defineConfig } from 'vite';

export default defineConfig({
  // Esto le dice a Vite que busque el archivo .env dentro de la carpeta functions
  envDir: './functions',
});