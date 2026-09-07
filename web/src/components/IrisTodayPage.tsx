"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { NewsSnapshot } from "@/lib/news";
import { sectionLabelPt } from "@/lib/sections";
import NewsRefresh from "./NewsRefresh";
type Story = NewsSnapshot["stories"][number];
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
export default function TodayPage({ snapshot }: { snapshot: NewsSnapshot }) {
  const [skips, setSkips] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  useEffect(() => { let active = true; fetch("/api/news/decisions").then(r => r.ok ? r.json() : { skipped: [] }).then(data => { if (active) setSkips(data.skipped ?? []); }).catch(() => {}); return () => { active = false; }; }, []);
  const groups = useMemo(() => snapshot.stories.reduce<Record<string, Story[]>>((a, s) => { (a[s.section_label] ??= []).push(s); return a; }, {}), [snapshot]);
  async function toggleSkip(story: Story) {
    setPending(story.id); setError("");
    const skipped = !skips.includes(story.id);
    try {
      const response = await fetch("/api/news/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ story_id: story.id, skipped }) });
      if (!response.ok) throw new Error("Não foi possível salvar a decisão. Tente novamente.");
      setSkips(current => skipped ? [...current, story.id] : current.filter(id => id !== story.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setPending(null); }
  }
  const visible = Object.entries(groups).filter(([section]) => filter === "all" || filter === section).map(([section, stories]) => [section, stories.filter(s => s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))] as const).filter(([, stories]) => stories.length);
  return <main className="space-y-8"><header className="iris-page-heading"><div><p className="microlabel">A sua próxima publicação começa aqui</p><h1>O que acontece hoje.</h1><p>As notícias da capa, organizadas para você escolher o que vale contar.</p></div><NewsRefresh snapshotId={snapshot.id} /></header>
    <div className="iris-edition"><span><span className="iris-live-dot" /> Edição Brasil</span><span>{date(snapshot.fetched_at)} · Brasília</span><span>{snapshot.stats.stories} pautas</span><span>{snapshot.stats.new} novas nesta rodada</span><Link href={`/iris/history?run=${snapshot.id}`}>Ver esta coleta ↗</Link></div>
    <div className="iris-filterbar"><div className="iris-filter-tabs" aria-label="Filtrar por seção"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas</button>{Object.keys(groups).map(section => <button key={section} aria-pressed={filter === section} onClick={() => setFilter(section)}>{sectionLabelPt(section)}</button>)}</div><input type="search" aria-label="Buscar pautas" placeholder="Buscar uma notícia…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    {visible.length === 0 && <p className="iris-empty">Nenhuma pauta encontrada. Tente outro termo ou seção.</p>}
    {visible.map(([section, stories]) => <section key={section}><div className="iris-section-title"><h2>{sectionLabelPt(section)}</h2><span>{stories.length} pautas</span></div><div className="iris-news-grid">{stories.map(s => {
      const skipped = skips.includes(s.id);
      return <article key={`${s.id}-${s.feed_position}`} className={`iris-news-card ${skipped ? "is-skipped" : ""}`}><div className="iris-card-meta"><span>{String(s.rank).padStart(2, "0")} / {sectionLabelPt(section)}</span>{s.is_new && <span className="iris-new">Nova</span>}</div><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3><p className="iris-outlets">{s.outlets.slice(0, 3).map(o => o.name).join(" · ")}{s.outlets.length > 3 ? ` +${s.outlets.length - 3}` : ""}</p><details className="iris-sources"><summary>{s.outlets.length} fontes para esta pauta</summary><ul>{s.outlets.map(o => <li key={o.url}><a href={o.url} target="_blank" rel="noreferrer">{o.name} ↗</a></li>)}</ul></details><div className="iris-card-actions"><Link className="iris-button" href={`/iris/editor?snapshot=${snapshot.id}&story=${s.id}`}>Criar post <span aria-hidden="true">↗</span></Link><button disabled={pending !== null} onClick={() => void toggleSkip(s)}>{pending === s.id ? "Salvando…" : skipped ? "Retomar pauta" : "Pular pauta"}</button></div></article>;
    })}</div></section>)}
    {snapshot.warnings?.length > 0 && <details className="text-xs text-ink-3"><summary>Sobre as seções desta edição</summary><p className="mt-2">As seções são inferidas da estrutura observada do RSS. Se ela mudar, as pautas são preservadas como não classificadas.</p></details>}
  </main>;
}
