import Link from "next/link";
import PromptSettings from "@/components/PromptSettings";

const navigation = [
  ["Hoje", "/iris"], ["Criar post", "/iris/manual"], ["Aprovados", "/iris/approved"],
  ["Publicados", "/iris/published"], ["Histórico", "/iris/history"], ["Painel", "/iris/dashboard"],
];

export default function IrisLayout({ children }: { children: React.ReactNode }) {
  return <div className="iris-app">
    <header className="iris-header">
      <Link href="/iris" className="iris-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gpb-mono.png" alt="GPB" />
        <span>IRIS</span>
      </Link>
      <nav aria-label="Navegação">{navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <PromptSettings />
      <Link className="iris-legacy" href="/dashboard">App antigo</Link>
    </header>
    <div className="iris-content">{children}</div>
  </div>;
}
