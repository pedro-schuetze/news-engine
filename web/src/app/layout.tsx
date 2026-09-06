import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata = { title: "Newsroom", description: "Editorial intelligence desk" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Sidebar /><main className="main-shell"><div className="topbar"><span className="topbar-label">Editorial intelligence</span><span className="topbar-date">Live desk · São Paulo</span></div><div className="content">{children}</div></main><MobileNav /></body></html>; }
