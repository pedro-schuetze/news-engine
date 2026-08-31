import Link from "next/link";
import type { StoryEntry } from "@/lib/data";
import type { Review } from "@/lib/types";
import { fmtDayMonth } from "@/lib/format";
import { REVIEW_UI, VERIFICATION_UI, verticalStyle } from "@/lib/ui";
import CopyButton from "./CopyButton";

export default function StoryRow({
  entry,
  review,
  verticalName,
}: {
  entry: StoryEntry;
  review: Review | null;
  verticalName?: string;
}) {
  const { story } = entry;
  const vstyle = verticalStyle(story.vertical);
  const reviewUi = REVIEW_UI[review?.review_status ?? "PENDING"];
  const verification = VERIFICATION_UI[story.verification.status];
  const draft = story.draft;

  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2/60">
        <span className="w-12 shrink-0 font-mono text-[11px] text-ink-3">
          {fmtDayMonth(entry.runStartedAt)}
        </span>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${vstyle.dot}`}
          title={verticalName ?? story.vertical}
        />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
          {draft?.instagram_headline || story.title}
        </span>
        {entry.runMode === "mock" && (
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 font-mono text-[10px] text-warn">
            mock
          </span>
        )}
        <span className="hidden w-8 shrink-0 text-right font-mono text-[11.5px] text-ink-2 sm:block">
          {Math.round(story.final_score)}
        </span>
        <span
          className={`hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block ${verification.dot}`}
          title={verification.label}
        />
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${reviewUi.chip}`}
        >
          {reviewUi.label}
        </span>
      </summary>
      <div className="space-y-2.5 bg-panel-2/40 px-4 py-3.5 pl-[76px] text-[13px] text-ink-2">
        {draft ? (
          <>
            <p>{draft.short_summary}</p>
            {draft.caption && (
              <div className="flex flex-wrap items-start gap-3">
                <p className="max-w-2xl flex-1 text-[12.5px] whitespace-pre-wrap text-ink-3">
                  {draft.caption}
                </p>
                <CopyButton
                  text={`${draft.caption}\n\n${draft.hashtags.join(" ")}`}
                  label="copiar caption"
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-ink-3">Story sem draft gerado.</p>
        )}
        <p className="font-mono text-[11px] text-ink-3">
          final {story.final_score.toFixed(1)} · trend {story.trend_score.toFixed(0)} · editorial{" "}
          {story.editorial_score} · {verification.label.toLowerCase()} ·{" "}
          {story.verification.independent_source_count} fonte(s)
        </p>
        <Link
          href={`/historico/${encodeURIComponent(entry.runFile)}#${story.story_id}`}
          className="inline-block font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
        >
          ver no run completo →
        </Link>
      </div>
    </details>
  );
}
