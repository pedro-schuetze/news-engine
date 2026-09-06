import Link from "next/link";
import type { StoryEntry } from "@/lib/data";
import { fmtLocal } from "@/lib/format";
import { verticalStyle } from "@/lib/ui";
import CopyButton from "./CopyButton";
import ExportButton from "./ExportButton";
import PublishButton from "./PublishButton";
import RemoveApprovedButton from "./RemoveApprovedButton";
import { slideVersion } from "@/lib/slides/version";

/**
 * Card do feed interno: o post como ele vai sair, com as imagens grandes, a
 * legenda pronta para copiar e o download do pacote.
 */
export default function ReadyPostCard({
  entry,
  verticalName,
  published = false,
}: {
  entry: StoryEntry;
  verticalName?: string;
  published?: boolean;
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
          {published ? "✓ published" : "✓ approved"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {fmtLocal(entry.runStartedAt)}
        </span>
      </div>

      {/* Compact preview: the queue is for scanning and decisions, not viewing a full carousel. */}
      {hasImages ? (
        <div className="flex gap-4 border-b border-line px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slideUrl(slides[0]?.slide_number ?? 1)}
            alt="Slide 1"
            loading="lazy"
            className="h-24 w-[76px] shrink-0 rounded-lg object-cover bg-panel-2"
          />
          <p className="self-center text-[12px] text-ink-2">{slides.length} slides ready for review</p>
        </div>
      ) : (
        <div className="m-1.5 rounded-xl border border-dashed border-line bg-panel-2/50 px-4 py-8 text-center">
          <p className="text-[13px] text-ink-2">No preview image yet.</p>
          <Link
            href={`/iris/manual?run=${encodeURIComponent(runFile)}#${story.story_id}`}
            className="mt-1 inline-block font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
          >
            Open the post editor →
          </Link>
        </div>
      )}

      {/* texto + ações */}
      <div className="space-y-3 border-t border-line px-4 py-4">
        <h3 className="text-[16px] leading-snug font-semibold tracking-tight text-ink">
          {draft.instagram_headline || story.title}
        </h3>

        <details className="xp">
          <summary>Caption ({draft.caption.split(/\s+/).length} words)</summary>
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
          <CopyButton text={captionFull} label="Copy caption" />
          {!published && <>
            <PublishButton storyId={story.story_id} runId={story.run_id} vertical={story.vertical} />
            <RemoveApprovedButton storyId={story.story_id} runId={story.run_id} vertical={story.vertical} />
          </>}
          <Link
            href={`/iris/manual?run=${encodeURIComponent(runFile)}#${story.story_id}`}
            className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink"
          >
            Open in editor
          </Link>
        </div>
      </div>
    </article>
  );
}
