"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [["Hoje", "/iris"], ["Criar post", "/iris/manual"], ["Aprovados", "/iris/approved"], ["Publicados", "/iris/published"], ["Histórico", "/iris/history"], ["Painel", "/iris/dashboard"]];
export default function IrisNavigation() {
  const path = usePathname();
  return <nav aria-label="Navegação principal">{items.map(([label, href]) => <Link href={href} key={href} aria-current={path === href || (href === "/iris" && path === "/iris/today") || (href === "/iris/manual" && path === "/iris/editor") ? "page" : undefined}>{label}</Link>)}</nav>;
}
