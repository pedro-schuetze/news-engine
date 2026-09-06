"use client";

import { usePathname } from "next/navigation";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";

export default function RootShell({ children }: { children: React.ReactNode }) {
  const iris = usePathname().startsWith("/iris");
  if (iris) return <>{children}</>;
  return <div className="flex min-h-screen"><Sidebar /><main className="min-w-0 flex-1"><MobileNav /><div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div></main></div>;
}
