"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function MobileNav() { const path = usePathname(); return <nav className="mobile-nav" aria-label="Mobile navigation">{[["Today","/","▦"],["Manual","/gerar","+"],["Approved","/prontos","✓"],["Published","/published","●"],["History","/historico","↺"]].map(([label,href,icon])=><Link key={href} href={href} className={href === "/" ? path === "/" || path === "/hoje" ? "active" : "" : path.startsWith(href) ? "active" : ""}><span>{icon}</span>{label}</Link>)}</nav>; }
