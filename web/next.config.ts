import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O dashboard lê JSONs do pipeline fora da pasta web/ (../data) via fs —
  // por isso todas as páginas são dinâmicas (sem SSG de dados).
  // Fixa o root de tracing em web/ (há outros lockfiles na máquina).
  outputFileTracingRoot: process.cwd(),
  // fontes TTF do renderer de slides precisam ir junto da function na Vercel
  outputFileTracingIncludes: {
    "/api/slide/**": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
