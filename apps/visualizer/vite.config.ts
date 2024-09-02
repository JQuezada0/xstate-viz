import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"

export default defineConfig({
    esbuild: {
        target: "esnext",
    },
    build: {
        target: "esnext",
        sourcemap: true
    },
    plugins: [viteReact()]
})