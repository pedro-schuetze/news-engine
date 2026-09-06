import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import RootShell from "@/components/RootShell";
import "./globals.css";

// papéis da identidade GPB: Fraunces ~ Recoleta (display), Jakarta ~ Satoshi (UI)
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "GPB · News",
  description: "GPB Media — redação automatizada, revisão editorial diária",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans">
<RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
