import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Build into the repo's top-level dist/ so Vercel finds it with or without project overrides.
export default defineConfig({ plugins: [react()], build: { outDir: "../../dist", emptyOutDir: true } });
