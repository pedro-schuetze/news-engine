import Link from "next/link";
import ReadyPostCard from "@/components/ReadyPostCard";
import { loadAllStories, loadReviews, loadVerticalNames } from "@/lib/data";
import { verticalStyle } from "@/lib/ui";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Feed interno dos posts aprovados: como eles vão sair, com legenda pronta e
 * download do pacote (JPGs + legenda) para publicar no Instagram.
 */
export default async function ProntosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const vertical = typeof sp.vertical === "string" ? sp.vertical : "";
  const onlyWithImages = sp.pendentes !== "1";

  const [entries, reviews, names] = await Promise.all([
    loadAllStories(30),
    loadReviews(),
    loadVerticalNames(),
  ]);

  const approved = entries.filter(
    (e) => reviews[e.story.story_id]?.review_status === "APPROVED",
  );
  const withImages = approved.filter((e) => (e.story.slide_media?.length ?? 0) > 0);
  const missingImages = approved.length - withImages.length;

  const filtered = (onlyWithImages ? withImages : approved).filter(
    (e) => !vertical || e.story.vertical === vertical,
  );

  const href = (next: { vertical?: string; pendentes?: boolean }) => {
    const params = new URLSearchParams();
    const v = next.vertical ?? vertical;
    const p = next.pendentes ?? !onlyWithImages;
    if (v) params.set("vertical", v);
    if (p) params.set("pendentes", "1");
    const qs = params.toString();
    return qs ? `/prontos?${qs}` : "/prontos";
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
      active ? "bg-ink text-white" : "border border-line bg-panel text-ink-2 hover:bg-panel-2"
    }`;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="microlabel">posts aprovados, prontos para publicar</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Prontos</h1>
        </div>
        <p className="font-mono text-[11.5px] text-ink-3">
          {withImages.length} com imagens
          {missingImages > 0 && ` · ${missingImages} aguardando imagens`}
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={href({ vertical: "" })} className={chip(vertical === "")}>
          Todas as verticais
        </Link>
        {Object.entries(names).map(([vid, name]) => {
          const count = withImages.filter((e) => e.story.vertical === vid).length;
          const vstyle = verticalStyle(vid);
          return (
            <Link key={vid} href={href({ vertical: vid })} className={chip(vertical === vid)}>
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" />
              <span className={vertical === vid ? "" : vstyle.text}>{name}</span>
              <span className="ml-1.5 font-mono text-[11px] opacity-70">{count}</span>
            </Link>
          );
        })}
        {missingImages > 0 && (
          <Link
            href={href({ pendentes: onlyWithImages })}
            className={`ml-auto ${chip(!onlyWithImages)}`}
          >
            {onlyWithImages ? "mostrar os que faltam imagem" : "só os prontos"}
          </Link>
        )}
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="xl:col-span-2 rounded-2xl border border-dashed border-line bg-panel px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-ink">
              {approved.length === 0
                ? "Nenhum post aprovado ainda"
                : "Nenhum post pronto com esses filtros"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-2">
              {approved.length === 0 ? (
                <>
                  Aprove um post em <Link href="/hoje" className="text-brand-ink hover:underline">Posts de hoje</Link>{" "}
                  e gere as imagens dele. Ele aparece aqui pronto para baixar.
                </>
              ) : (
                "Ajuste os filtros acima."
              )}
            </p>
          </div>
        ) : (
          filtered.map((e) => (
            <ReadyPostCard
              key={`${e.runFile}-${e.story.story_id}`}
              entry={e}
              verticalName={names[e.story.vertical]}
            />
          ))
        )}
      </section>

      {filtered.length > 0 && (
        <p className="mt-6 font-mono text-[11px] text-ink-3">
          o .zip traz slide_01.jpg … slide_0{filtered[0].story.draft?.slides.length ?? 5}.jpg
          (1080×1350) e legenda.txt com caption, hashtags e as fontes
        </p>
      )}
    </div>
  );
}
