import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Engine",
  description: "Redação automatizada — revisão editorial diária",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
