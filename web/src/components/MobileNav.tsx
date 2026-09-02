"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/hoje", label: "Hoje" },
  { href: "/gerar", label: "Gerar" },
  { href: "/prontos", label: "Prontos" },
  { href: "/historico", label: "Histórico" },
  { href: "/config", label: "Config" },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-panel px-4 py-3 md:hidden">
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[20px] font-bold leading-none text-ink">GPB</span>
          <span className="font-mono text-[9px] font-semibold tracking-[0.3em] text-ink-2">
            NEWS<span className="text-brand">.</span>
          </span>
        </span>
        <nav className="flex gap-1">
          {ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${
                  active ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-panel-2"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
