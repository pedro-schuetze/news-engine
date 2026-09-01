"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/hoje",
    label: "Posts de hoje",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <path d="M2 6h12M5.5 1.5v2M10.5 1.5v2" />
      </svg>
    ),
  },
  {
    href: "/prontos",
    label: "Prontos",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <path d="M9.5 11.5l1.5 1.5 3-3" />
      </svg>
    ),
  },
  {
    href: "/historico",
    label: "Histórico",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
    ),
  },
  {
    href: "/config",
    label: "Configurações",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 4.5h10M3 8h10M3 11.5h10" />
        <circle cx="6" cy="4.5" r="1.4" fill="var(--color-panel)" />
        <circle cx="10.5" cy="8" r="1.4" fill="var(--color-panel)" />
        <circle cx="5" cy="11.5" r="1.4" fill="var(--color-panel)" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <div className="border-b border-line px-5 py-5">
        <Link href="/" className="block">
          <span className="font-mono text-[13px] font-semibold tracking-[0.06em] text-navy">
            NEWS·ENGINE
          </span>
          <span className="mt-1 block text-[11px] text-ink-3">redação automatizada</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-brand-soft text-brand-ink"
                  : "text-ink-2 hover:bg-panel-2 hover:text-ink"
              }`}
            >
              <span className={active ? "text-brand" : "text-ink-3"}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-5 py-4">
        <p className="microlabel">MVP · v0.1</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          Pipeline diário às 06:00.
          <br />
          Reviews alimentam o approval rate.
        </p>
      </div>
    </aside>
  );
}
