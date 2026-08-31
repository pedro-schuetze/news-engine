import type { Review, Story } from "@/lib/types";
import { fmtLocal, recency } from "@/lib/format";
import ReviewButtons from "./ReviewButtons";

const TONES: Record<string, string> = {
  emerald: "border-emerald-800/60 bg-emerald-950/60 text-emerald-400",
  amber: "border-amber-800/60 bg-amber-950/60 text-amber-400",
  red: "border-red-800/60 bg-red-950/60 text-red-400",
  zinc: "border-zinc-700 bg-zinc-900 text-zinc-400",
  sky: "border-sky-800/60 bg-sky-950/60 text-sky-400",
  violet: "border-violet-800/60 bg-violet-950/60 text-violet-400",
};

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const VERIFICATION_TONE: Record<string, keyof typeof TONES> = {
  VERIFIED: "emerald",
  PARTIALLY_VERIFIED: "amber",
  UNVERIFIED: "red",
};
const REVIEW_TONE: Record<string, keyof typeof TONES> = {
  APPROVED: "emerald",
  REJECTED: "red",
  PENDING: "zinc",
};

export default function StoryCard({ story, review }: { story: Story; review: Review | null }) {
  const draft = story.draft;
  const reviewStatus = review?.review_status ?? "PENDING";
  const headline = draft?.instagram_headline || story.title;
  const sourceCount = (story.verification.primary_source ? 1 : 0) + story.verification.supporting_sources.length;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-zinc-100">
            <span className="mr-2 text-zinc-500">#{story.selection_rank}</span>
            {headline}
          </h3>
          {headline !== story.title && (
            <p className="mt-0.5 text-sm text-zinc-500">Story original: {story.title}</p>
          )}
        </div>
        <div className="text-right text-sm leading-tight">
          <div className="text-xl font-bold text-zinc-100">{Math.round(story.final_score)}</div>
          <div className="text-xs text-zinc-500">
            trend {Math.round(story.trend_score)} · editorial {story.editorial_score}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={VERIFICATION_TONE[story.verification.status] ?? "zinc"}>
          {story.verification.status}
        </Badge>
        <Badge tone={REVIEW_TONE[reviewStatus]}>{reviewStatus}</Badge>
        {story.content_type && <Badge tone="sky">{story.content_type}</Badge>}
        <Badge tone="violet">{story.verification.independent_source_count} fonte(s) indep.</Badge>
        <Badge tone="zinc">{recency(story.latest_published_at)}</Badge>
        {story.is_rumor_or_claim && <Badge tone="amber">⚠ alegação/rumor — exige atribuição</Badge>}
      </div>

      {draft ? (
        <div className="mt-4 space-y-2 text-sm text-zinc-300">
          <p>
            <span className="font-semibold text-zinc-100">Resumo: </span>
            {draft.short_summary}
          </p>
          <p>
            <span className="font-semibold text-zinc-100">Por que importa: </span>
            {draft.why_it_matters}
          </p>
          {draft.key_facts.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {draft.key_facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-amber-800/50 bg-amber-950/40 p-3 text-sm text-amber-300">
          Draft não gerado para esta story — ver erros do run no debug.
        </p>
      )}

      <div className="mt-4 space-y-2">
        <details className="rounded-lg border border-zinc-800 p-3">
          <summary>Fontes ({sourceCount}) e verificação</summary>
          <div className="mt-3 space-y-2 text-sm">
            {story.verification.primary_source && (
              <p>
                <span className="font-semibold text-zinc-200">Primária: </span>
                <a
                  className="text-sky-400 hover:underline"
                  href={story.verification.primary_source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {story.verification.primary_source.name}
                </a>{" "}
                <span className="text-zinc-500">
                  · {story.verification.primary_source.source_domain} ·{" "}
                  {story.verification.primary_source.source_type} · autoridade{" "}
                  {story.verification.primary_source.authority_score} ·{" "}
                  {fmtLocal(story.verification.primary_source.published_at)}
                </span>
              </p>
            )}
            <ul className="list-disc space-y-1 pl-5">
              {story.verification.supporting_sources.map((s) => (
                <li key={s.article_id}>
                  <a className="text-sky-400 hover:underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>{" "}
                  <span className="text-zinc-500">
                    · {s.source_domain} · {s.source_type} · autoridade {s.authority_score}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-zinc-400">{story.verification.verification_notes}</p>
            {story.verification.contradictions_found.length > 0 && (
              <p className="text-red-400">
                Contradições: {story.verification.contradictions_found.join("; ")}
              </p>
            )}
            {story.claim_attribution && (
              <p className="text-amber-300">Atribuição da alegação: {story.claim_attribution}</p>
            )}
          </div>
        </details>

        {draft && draft.slides.length > 0 && (
          <details className="rounded-lg border border-zinc-800 p-3">
            <summary>Carrossel ({draft.slides.length} slides)</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {draft.slides.map((s) => (
                <div key={s.slide_number} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="text-xs font-semibold tracking-wide text-violet-400">
                    SLIDE {s.slide_number} · {s.role}
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">{s.headline}</div>
                  <p className="mt-1 text-sm text-zinc-300">{s.body}</p>
                  <p className="mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
                    🖼 {s.image_direction}
                    <br />
                    <span className="text-zinc-600">fonte da imagem: {s.image_source_type}</span>
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}

        {draft && draft.caption && (
          <details className="rounded-lg border border-zinc-800 p-3">
            <summary>Caption do Instagram</summary>
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-900 p-3 text-sm text-zinc-300">
              {draft.caption}
              {"\n\n"}
              {draft.hashtags.join(" ")}
            </pre>
          </details>
        )}

        <details className="rounded-lg border border-zinc-800 p-3">
          <summary>Racional do engine</summary>
          <div className="mt-3 space-y-2 text-sm text-zinc-400">
            {story.classification && (
              <p>
                <span className="font-semibold text-zinc-200">Classificação: </span>
                {story.classification.primary_vertical} (confiança{" "}
                {story.classification.classification_confidence.toFixed(2)}) —{" "}
                {story.classification.classification_reason}
                {Object.keys(story.classification.vertical_scores).length > 0 && (
                  <span className="block text-xs text-zinc-500">
                    vertical scores:{" "}
                    {Object.entries(story.classification.vertical_scores)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}
                  </span>
                )}
              </p>
            )}
            <p>
              <span className="font-semibold text-zinc-200">Score editorial: </span>
              {story.editorial_score} — {story.editorial_reason}
            </p>
            {Object.keys(story.editorial_sub_scores).length > 0 && (
              <p className="text-xs">
                sub-scores:{" "}
                {Object.entries(story.editorial_sub_scores)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </p>
            )}
            <p className="text-xs">
              trend:{" "}
              {Object.entries(story.trend_signals)
                .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                .join(", ")}
            </p>
            <p className="text-xs">fórmula: {story.final_score_notes.join(" | ")}</p>
            {story.red_flags.length > 0 && (
              <p className="text-amber-400">red flags: {story.red_flags.join("; ")}</p>
            )}
          </div>
        </details>
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-4">
        <ReviewButtons
          storyId={story.story_id}
          runId={story.run_id}
          vertical={story.vertical}
          current={reviewStatus}
        />
      </div>
    </article>
  );
}
