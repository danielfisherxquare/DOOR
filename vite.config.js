import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],
  define: {
    'process.env.NEXT_PUBLIC_ASSETS_CDN_URL': JSON.stringify('https://editor.pascal.app')
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          // Map libraries
          if (id.includes('/cesium/')) {
            return 'vendor-cesium'
          }
          if (id.includes('/leaflet/')) {
            return 'vendor-leaflet'
          }
          if (id.includes('/@turf/')) {
            return 'vendor-turf'
          }

          if (
            id.includes('/three/examples/') ||
            id.includes('/three-stdlib/')
          ) {
            return 'vendor-three-extras'
          }

          if (id.includes('/three/')) {
            return 'vendor-three-core'
          }

          if (
            id.includes('/@react-three/fiber/') ||
            id.includes('/@react-three/drei/')
          ) {
            return 'vendor-react-three'
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/')
          ) {
            return 'vendor-react'
          }

          if (id.includes('/chart.js/')) {
            return 'vendor-chart'
          }

          if (
            id.includes('/react-toastify/') ||
            id.includes('/zustand/')
          ) {
            return 'vendor-ui'
          }

          if (
            id.includes('/xlsx/') ||
            id.includes('/docxtemplater/') ||
            id.includes('/pizzip/') ||
            id.includes('/file-saver/')
          ) {
            return 'vendor-docs'
          }

          if (
            id.includes('/echarts/') ||
            id.includes('/echarts-for-react/')
          ) {
            return 'vendor-echarts'
          }

          if (id.includes('/axios/')) {
            return 'vendor-network'
          }
        }
      }
    }
  }
})
