"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const items = [
  ["Today", "/", "▦"], ["Manual Mode", "/gerar", "+"],
  ["Approved", "/prontos", "✓"], ["Published", "/published", "●"],
  ["History", "/historico", "↺"], ["Dashboard", "/dashboard", "◫"], ["Settings", "/config", "⚙"],
];

export default function Sidebar() {
  const path = usePathname();
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">N</span><span>NEWSROOM<span className="brand-dot">.</span></span></div>
    <p className="sidebar-kicker">Editorial desk</p>
    <nav aria-label="Primary navigation" className="nav-list">{items.map(([label, href, icon]) => {
      const active = href === "/" ? (path === "/" || path === "/hoje") : path.startsWith(href);
      return <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}><span className="nav-icon">{icon}</span>{label}</Link>;
    })}</nav>
    <div className="sidebar-bottom"><div className="status"><span /> Pipeline online</div><ThemeToggle /></div>
  </aside>;
}
