import Link from "next/link";
import PromptSettings from "@/components/PromptSettings";

const navigation = [
  ["Today", "/iris"], ["Manual Mode", "/iris/manual"], ["Approved", "/iris/approved"],
  ["Published", "/iris/published"], ["History", "/iris/history"], ["Dashboard", "/iris/dashboard"],
];

export default function IrisLayout({ children }: { children: React.ReactNode }) {
  return <div className="iris-app">
    <header className="iris-header">
      <Link href="/iris" className="iris-brand" title="Iris by John Atkinson Grimshaw (1886)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://eclecticlight.co/wp-content/uploads/2021/02/grimshawiris.jpg?w=1024" alt="Iris, Greek goddess of the rainbow" />
        <span>IRIS</span>
      </Link>
      <nav aria-label="Iris navigation">{navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <PromptSettings />
      <Link className="iris-legacy" href="/">Open GPB app</Link>
    </header>
    <div className="iris-content">{children}</div>
  </div>;
}
