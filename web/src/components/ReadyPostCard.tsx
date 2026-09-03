import Link from "next/link";
import type { StoryEntry } from "@/lib/data";
import { fmtLocal } from "@/lib/format";
import { verticalStyle } from "@/lib/ui";
import CopyButton from "./CopyButton";
import ExportButton from "./ExportButton";
import { slideVersion } from "@/lib/slides/version";

/**
 * Card do feed interno: o post como ele vai sair, com as imagens grandes, a
 * legenda pronta para copiar e o download do pacote.
 */
export default function ReadyPostCard({
  entry,
  verticalName,
}: {
  entry: StoryEntry;
  verticalName?: string;
}) {
  const { story, runFile } = entry;
  const draft = story.draft;
  if (!draft) return null;

  const vstyle = verticalStyle(story.vertical);
  const slides = draft.slides;
  const hasImages = (story.slide_media?.length ?? 0) > 0;
  const captionFull = `${draft.caption}\n\n${draft.hashtags.join(" ")}`;
  const slideUrl = (n: number) =>
    `/api/slide/${story.story_id}/${n}?run=${encodeURIComponent(runFile)}&v=${slideVersion(story, n)}`;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-panel">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium ${vstyle.chip}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${vstyle.dot}`} />
          {verticalName ?? story.vertical}
        </span>
        <span className="rounded-full bg-brand-soft px-2.5 py-[3px] text-[11.5px] font-medium text-brand-ink">
          ✓ aprovado
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {fmtLocal(entry.runStartedAt)}
        </span>
      </div>

      {/* imagens: capa grande + demais em faixa */}
      {hasImages ? (
        <div className="grid gap-1.5 p-1.5 sm:grid-cols-[3fr_2fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slideUrl(slides[0]?.slide_number ?? 1)}
            alt="Slide 1"
            loading="lazy"
            className="w-full rounded-xl bg-panel-2"
            style={{ aspectRatio: "1080 / 1350" }}
          />
          <div className="grid grid-cols-2 gap-1.5">
            {slides.slice(1).map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.slide_number}
                src={slideUrl(s.slide_number)}
                alt={`Slide ${s.slide_number}`}
                loading="lazy"
                className="w-full rounded-lg bg-panel-2"
                style={{ aspectRatio: "1080 / 1350" }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="m-1.5 rounded-xl border border-dashed border-line bg-panel-2/50 px-4 py-8 text-center">
          <p className="text-[13px] text-ink-2">Este post ainda não tem imagens.</p>
          <Link
            href={`/hoje#${story.story_id}`}
            className="mt-1 inline-block font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
          >
            gerar imagens no card do post →
          </Link>
        </div>
      )}

      {/* texto + ações */}
      <div className="space-y-3 border-t border-line px-4 py-4">
        <h3 className="text-[16px] leading-snug font-semibold tracking-tight text-ink">
          {draft.instagram_headline || story.title}
        </h3>

        <details className="xp">
          <summary>Legenda ({draft.caption.split(/\s+/).length} palavras)</summary>
          <div className="mt-2 rounded-lg bg-panel-2/60 p-3">
            <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
              {draft.caption}
            </pre>
            <p className="mt-2 font-mono text-[12px] text-pol">{draft.hashtags.join(" ")}</p>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ExportButton
            storyId={story.story_id}
            runFile={runFile}
            slideCount={slides.length}
            disabled={!hasImages}
          />
          <CopyButton text={captionFull} label="copiar legenda" />
          <Link
            href={`/historico/${encodeURIComponent(runFile)}#${story.story_id}`}
            className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink"
          >
            abrir no run
          </Link>
        </div>
      </div>
    </article>
  );
}
