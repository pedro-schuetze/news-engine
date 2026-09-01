import type { Review, Story } from "@/lib/types";
import { fmtLocal, recency } from "@/lib/format";
import { CONTENT_TYPE_LABEL, REVIEW_UI, VERIFICATION_UI, verticalStyle } from "@/lib/ui";
import CopyButton from "./CopyButton";
import ReviewButtons from "./ReviewButtons";

function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export default function StoryCard({
  story,
  review,
  verticalName,
  runFile = "latest",
}: {
  story: Story;
  review: Review | null;
  verticalName?: string;
  runFile?: string;
}) {
  const draft = story.draft;
  const reviewStatus = review?.review_status ?? "PENDING";
  const headline = draft?.instagram_headline || story.title;
  const vstyle = verticalStyle(story.vertical);
  const verification = VERIFICATION_UI[story.verification.status];
  const reviewUi = REVIEW_UI[reviewStatus];
  const sourceCount =
    (story.verification.primary_source ? 1 : 0) + story.verification.supporting_sources.length;
  const captionFull = draft ? `${draft.caption}\n\n${draft.hashtags.join(" ")}` : "";

  return (
    <article
      id={story.story_id}
      className="rounded-2xl border border-line bg-panel p-5 md:p-6"
    >
      {/* topo: identificação + score */}
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-ink-3">
              #{story.selection_rank}
            </span>
            <Chip className={vstyle.chip}>
              <span className={`h-1.5 w-1.5 rounded-full ${vstyle.dot}`} />
              {verticalName ?? story.vertical}
            </Chip>
            {story.content_type && (
              <Chip className="bg-panel-2 text-ink-2">
                {CONTENT_TYPE_LABEL[story.content_type] ?? story.content_type}
              </Chip>
            )}
            {story.is_rumor_or_claim && (
              <Chip className="bg-warn-soft text-warn">⚠ alegação — exige atribuição</Chip>
            )}
          </div>
          <h3 className="text-[17px] leading-snug font-semibold tracking-tight text-ink md:text-lg">
            {headline}
          </h3>
          {headline !== story.title && (
            <p className="mt-1 text-[12.5px] text-ink-3">Story original: {story.title}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[28px] leading-none font-semibold tracking-tight text-navy">
            {Math.round(story.final_score)}
          </div>
          <div className="microlabel mt-1">score final</div>
          <div className="mt-1 font-mono text-[11px] text-ink-3">
            T{Math.round(story.trend_score)} · E{story.editorial_score}
          </div>
        </div>
      </div>

      {/* linha de estado */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Chip className={verification.chip}>
          <span className={`h-1.5 w-1.5 rounded-full ${verification.dot}`} />
          {verification.label}
        </Chip>
        <Chip className="bg-panel-2 text-ink-2">
          {story.verification.independent_source_count} fonte
          {story.verification.independent_source_count === 1 ? "" : "s"} indep.
        </Chip>
        <Chip className={reviewUi.chip}>{reviewUi.label}</Chip>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {recency(story.latest_published_at)}
        </span>
      </div>

      {/* conteúdo editorial */}
      {draft ? (
        <div className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">Resumo — </span>
            {draft.short_summary}
          </p>
          <p>
            <span className="font-semibold text-ink">Por que importa — </span>
            {draft.why_it_matters}
          </p>
          {draft.key_facts.length > 0 && (
            <ul className="space-y-1 pl-1">
              {draft.key_facts.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-warn-soft p-3 text-[13px] text-warn">
          Draft não gerado para esta story — ver erros do run no debug.
        </p>
      )}

      {/* expanders */}
      <div className="mt-4 space-y-1.5 border-t border-line pt-3">
        <details className="xp">
          <summary>Fontes ({sourceCount}) e verificação</summary>
          <div className="mt-2 space-y-2 rounded-lg bg-panel-2/60 p-3 text-[13px]">
            {story.verification.primary_source && (
              <p>
                <span className="microlabel mr-2">primária</span>
                <a
                  className="font-medium text-pol hover:underline"
                  href={story.verification.primary_source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {story.verification.primary_source.name}
                </a>{" "}
                <span className="text-ink-3">
                  · {story.verification.primary_source.source_domain} ·{" "}
                  {story.verification.primary_source.source_type} · aut.{" "}
                  {story.verification.primary_source.authority_score} ·{" "}
                  {fmtLocal(story.verification.primary_source.published_at)}
                </span>
              </p>
            )}
            <ul className="space-y-1">
              {story.verification.supporting_sources.map((s) => (
                <li key={s.article_id} className="text-ink-2">
                  <a className="text-pol hover:underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>{" "}
                  <span className="text-ink-3">
                    · {s.source_domain} · {s.source_type} · aut. {s.authority_score}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink-3">{story.verification.verification_notes}</p>
            {story.verification.contradictions_found.length > 0 && (
              <p className="text-danger">
                Contradições: {story.verification.contradictions_found.join("; ")}
              </p>
            )}
            {story.claim_attribution && (
              <p className="text-warn">Atribuição: {story.claim_attribution}</p>
            )}
          </div>
        </details>

        {draft && draft.slides.length > 0 && (
          <details className="xp">
            <summary>Post renderizado ({draft.slides.length} slides)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
              {draft.slides.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={s.slide_number}
                  src={`/api/slide/${story.story_id}/${s.slide_number}?run=${encodeURIComponent(runFile)}`}
                  alt={`Slide ${s.slide_number}`}
                  loading="lazy"
                  className="w-full rounded-lg border border-line bg-panel-2"
                  style={{ aspectRatio: "1080 / 1350" }}
                />
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              1080×1350 · renderizado ao vivo (fotos: Wikimedia/Openverse com crédito) — é a
              prévia real do que a fase de publicação enviará ao Instagram.
            </p>
          </details>
        )}

        {draft && draft.slides.length > 0 && (
          <details className="xp">
            <summary>Textos e direções dos slides</summary>
            <div className="mt-2 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {draft.slides.map((s) => (
                <div key={s.slide_number} className="rounded-xl border border-line bg-panel-2/50 p-3.5">
                  <div className="microlabel">
                    slide {s.slide_number} · {s.role.toLowerCase().replaceAll("_", " ")}
                  </div>
                  <div className="mt-1.5 text-[14px] font-semibold text-ink">{s.headline}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.body}</p>
                  <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] leading-relaxed text-ink-3">
                    <span className="microlabel mr-1.5">img</span>
                    {s.image_direction}
                    <span className="mt-0.5 block font-mono text-[10.5px]">
                      {s.image_source_type.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}

        {draft && draft.caption && (
          <details className="xp">
            <summary>Caption do Instagram</summary>
            <div className="mt-2 rounded-lg bg-panel-2/60 p-3">
              <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {draft.caption}
              </pre>
              <p className="mt-2 font-mono text-[12px] text-pol">{draft.hashtags.join(" ")}</p>
              <div className="mt-3">
                <CopyButton text={captionFull} label="copiar caption" />
              </div>
            </div>
          </details>
        )}

        <details className="xp">
          <summary>Racional do engine</summary>
          <div className="mt-2 space-y-2 rounded-lg bg-panel-2/60 p-3 text-[12.5px] text-ink-2">
            {story.classification && (
              <p>
                <span className="font-semibold text-ink">Classificação: </span>
                {story.classification.primary_vertical} (confiança{" "}
                {story.classification.classification_confidence.toFixed(2)}) —{" "}
                {story.classification.classification_reason}
              </p>
            )}
            <p>
              <span className="font-semibold text-ink">Editorial: </span>
              {story.editorial_score} — {story.editorial_reason}
            </p>
            {Object.keys(story.editorial_sub_scores).length > 0 && (
              <p className="font-mono text-[11px] text-ink-3">
                {Object.entries(story.editorial_sub_scores)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
            )}
            <p className="font-mono text-[11px] text-ink-3">
              trend:{" "}
              {Object.entries(story.trend_signals)
                .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                .join("  ")}
            </p>
            <p className="font-mono text-[11px] text-ink-3">{story.final_score_notes.join(" | ")}</p>
            {story.red_flags.length > 0 && (
              <p className="text-warn">Red flags: {story.red_flags.join("; ")}</p>
            )}
          </div>
        </details>
      </div>

      {/* ações */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <ReviewButtons
          storyId={story.story_id}
          runId={story.run_id}
          vertical={story.vertical}
          current={reviewStatus}
        />
        {review?.reviewed_at && (
          <span className="font-mono text-[11px] text-ink-3">
            revisada em {fmtLocal(review.reviewed_at)}
          </span>
        )}
      </div>
    </article>
  );
}
