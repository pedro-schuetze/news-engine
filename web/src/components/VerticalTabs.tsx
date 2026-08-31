import Link from "next/link";
import { verticalStyle } from "@/lib/ui";

export interface TabItem {
  id: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
}

export default function VerticalTabs({ items }: { items: TabItem[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-panel p-1">
      {items.map((t) => {
        const vstyle = verticalStyle(t.id);
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              t.active ? "bg-ink text-white" : "text-ink-2 hover:bg-panel-2"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${vstyle.dot}`} />
            {t.label}
            <span
              className={`font-mono text-[11px] ${t.active ? "text-white/70" : "text-ink-3"}`}
            >
              {t.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
