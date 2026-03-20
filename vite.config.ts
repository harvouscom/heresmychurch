import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))

/** Must match `projectId` in utils/supabase/info.tsx — proxy avoids CORS when calling Edge Functions from localhost */
const SUPABASE_HOST = 'https://epufchwxofsyuictfufy.supabase.co'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    proxy: {
      '/functions/v1/make-server-283d8046': {
        target: SUPABASE_HOST,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
