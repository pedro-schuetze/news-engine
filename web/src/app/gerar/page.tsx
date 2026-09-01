import ComposeForm from "@/components/ComposeForm";
import RunView from "@/components/RunView";
import { loadReviews, loadRun, loadVerticalNames } from "@/lib/data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * "Gerar post": cola o link de uma notícia (ou vários sobre o mesmo assunto) e
 * o sistema devolve o modelo padrão — 5 slides, legenda e os mesmos botões de
 * imagem dos posts automáticos. Aceitar manda para Prontos; recusar apaga.
 */
export default async function GerarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const runFile = typeof sp.run === "string" ? sp.run : "";
  const debug = sp.debug === "1";
  const tab = typeof sp.tab === "string" ? sp.tab : "";

  const [run, reviews, names] = await Promise.all([
    runFile ? loadRun(runFile) : Promise.resolve(null),
    loadReviews(),
    loadVerticalNames(),
  ]);

  return (
    <div>
      <header>
        <p className="microlabel">post a partir de um link</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Gerar post</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] text-ink-2">
          Cole o link da notícia (ou vários links sobre o mesmo acontecimento, um por linha). O
          texto sai no mesmo formato dos posts automáticos e usa as mesmas regras editoriais.
        </p>
      </header>

      <div className="mt-5">
        <ComposeForm verticals={names} currentRun={runFile} />
      </div>

      {run && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <p className="microlabel">resultado</p>
            <span className="font-mono text-[11px] text-ink-3">
              revise, ajuste se precisar e aceite — ou descarte no botão acima
            </span>
          </div>
          <RunView
            run={run}
            reviews={reviews}
            names={names}
            basePath={`/gerar?run=${encodeURIComponent(runFile)}`}
            tab={tab}
            debug={debug}
            runFile={runFile}
            minStories={1}
          />
        </section>
      )}
    </div>
  );
}
