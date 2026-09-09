import Link from "next/link";
import PromptSettings from "@/components/PromptSettings";
import ThemeToggle from "@/components/ThemeToggle";
import IrisNavigation from "@/components/IrisNavigation";
export default function IrisLayout({ children }: { children: React.ReactNode }) {
  return <div className="iris-app"><a href="#content" className="iris-skip">Pular para o conteúdo</a><header className="iris-header"><Link href="/iris" className="iris-brand"><span className="iris-mark" aria-hidden="true"></span><span>iris<span className="iris-brand-note">a sua redação</span></span></Link><IrisNavigation /><div className="iris-tools"><PromptSettings /><ThemeToggle /></div></header><div id="content" className="iris-content">{children}</div><footer className="iris-footer">Iris · Da notícia à publicação, com você no comando.</footer></div>;
}
