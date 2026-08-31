import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "News Engine",
  description: "Redação automatizada — revisão editorial diária",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <MobileNav />
            <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
