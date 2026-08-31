import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O dashboard lê JSONs do pipeline fora da pasta web/ (../data) via fs —
  // por isso todas as páginas são dinâmicas (sem SSG de dados).
  // Fixa o root de tracing em web/ (há outros lockfiles na máquina).
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
