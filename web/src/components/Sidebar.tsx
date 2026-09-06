"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const items = [
  ["GPB app", "/", "▦"], ["IRIS (new)", "/iris", "◒"],
  ["Today", "/", "▦"], ["Manual Mode", "/gerar", "+"],
  ["Approved", "/prontos", "✓"], ["Published", "/published", "●"],
  ["History", "/historico", "↺"], ["Dashboard", "/dashboard", "◫"], ["Settings", "/config", "⚙"],
];

export default function Sidebar() {
  const path = usePathname();
  return <aside className="sidebar">
    <div className="brand">
      <a className="brand-mark" href="https://eclecticlight.co/2021/02/23/goddess-of-the-week-iris-the-rainbow/" target="_blank" rel="noreferrer" title="Iris by John Atkinson Grimshaw (1886) — source and credit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://eclecticlight.co/wp-content/uploads/2021/02/grimshawiris.jpg?w=1024" alt="Iris, Greek goddess of the rainbow" />
      </a>
      <span>IRIS<span className="brand-dot">.</span></span>
    </div>
    <p className="sidebar-kicker">Editorial desk</p>
    <nav aria-label="Primary navigation" className="nav-list">{items.map(([label, href, icon]) => {
      const active = href === "/" ? (path === "/" || path === "/hoje") : path.startsWith(href);
      return <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}><span className="nav-icon">{icon}</span>{label}</Link>;
    })}</nav>
    <div className="sidebar-bottom"><div className="status"><span /> Pipeline online</div><ThemeToggle /></div>
  </aside>;
}
