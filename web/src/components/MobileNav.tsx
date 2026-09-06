"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function MobileNav() { const path = usePathname(); return <nav className="mobile-nav" aria-label="Mobile navigation">{[["Today","/hoje","▦"],["Dashboard","/","◫"],["Create","/gerar","+"],["Ready","/prontos","✓"],["History","/historico","↺"]].map(([label,href,icon])=><Link key={href} href={href} className={href === "/" ? path === "/" ? "active" : "" : path.startsWith(href) ? "active" : ""}><span>{icon}</span>{label}</Link>)}</nav>; }
