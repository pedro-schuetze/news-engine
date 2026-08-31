# Persistência futura — Supabase vs. Turso + Cloudflare

**Decisão: Supabase.** (Análise feita em 2026-08-30; nada implementado ainda —
o MVP usa JSON via `JsonNewsRepository` e a troca acontece atrás da interface
`NewsRepository`.)

## Contexto

O MVP persiste tudo em JSON commitado no repositório (runs, reviews). Isso é
deliberado: auditável, zero custo, zero operação. Os limites conhecidos:

- o dashboard na Vercel não consegue **escrever** reviews em produção (filesystem
  serverless é efêmero) — hoje reviews só funcionam com o dashboard local;
- queries analíticas (approval rate histórico, performance por assunto) viram
  varredura de arquivos;
- futuro próximo tem **imagens** (carrosséis renderizados 1080x1350, ~5 slides
  por post, 9-15 posts/dia ≈ 50-75 imagens/dia) e **publicação** com estado.

## Comparação (critérios do spec §52)

| # | Critério | Supabase | Turso + Cloudflare (R2/Workers) |
|---|----------|----------|--------------------------------|
| 1 | Simplicidade operacional | **Melhor**: DB + storage + auth + API num painel só | Duas plataformas para integrar e operar |
| 2 | Custo inicial | Free tier generoso (500MB DB, 1GB storage) | Free tiers também generosos |
| 3 | Custo em escala | Previsível; storage/egress podem crescer | **Melhor** em egress de imagem (R2 sem taxa de saída) |
| 4 | Volume de imagens | Storage nativo com transformações básicas | R2 excelente e mais barato em volume |
| 5 | Entrega pública de imagem | CDN embutida no Storage | **Melhor**: R2 + Cloudflare CDN |
| 6 | Frequência de leitura (dashboard/site) | Postgres + PostgREST resolve bem | Turso é rápido, mas SQLite distribuído tem limites de escrita |
| 7 | Frequência de escrita (runs diários, poucos milhares de rows/dia) | Trivial para Postgres | Trivial também |
| 8 | Compatibilidade com Python | **Melhor**: `supabase-py` maduro + Postgres puro (psycopg) como fallback | Turso via libSQL client (ok, menos maduro em Python) |
| 9 | Compatibilidade futura com Next.js | **Melhor**: integração de primeira classe (Vercel + Supabase é caminho batido) | Boa, mas mais colagem manual |
| 10 | Facilidade de desenvolvimento | **Melhor**: painel SQL, RLS, logs, tudo junto | Mais peças móveis |
| 11 | Observabilidade | Painel com logs de API/DB | Espalhada entre Turso e Cloudflare |
| 12 | Backups | Automáticos no plano pago; dump fácil no free | Turso tem branching/backup; R2 exige política própria |
| 13 | Migrations | Ferramental SQL padrão (supabase cli / dbmate / alembic) | SQLite migrations ok, ferramental menor |
| 14 | Queries analíticas | **Melhor**: Postgres (window functions, joins pesados) | SQLite aguenta o MVP, aperta depois |
| 15 | Integração com jobs (GitHub Actions) | HTTP/SQL direto do Python do Actions | Igualmente ok |
| 16 | Vendor lock-in | Baixo: é Postgres — dump e migra | Baixo/médio: SQLite é portátil, Workers menos |
| 17 | Projeto de uma pessoa só | **Melhor**: menos superfícies para operar | Mais contas/serviços para uma pessoa cuidar |

## Recomendação

**Supabase**, pelos critérios 1, 8, 9, 10, 14 e 17 — exatamente os que mais
importam para um projeto mantido por uma pessoa que vai crescer para um site
Next.js. O único ponto em que Turso+Cloudflare ganha com folga é custo de
entrega de imagem em escala grande (egress). Mitigação registrada: se o custo
de storage/egress do Supabase incomodar quando houver site público com tráfego
real, mover **apenas o storage de imagens** para R2 atrás da interface
`MediaStorage` (que já existe) — mantendo Postgres/Supabase como banco. As duas
decisões são independentes justamente por causa das abstrações.

## Esboço do schema futuro (referência, não implementar agora)

```
sources(id, name, domain, category, authority_score, language, country, enabled)
articles(id, source_id, title, url, canonical_url, published_at, collected_at,
         collector, query, language, raw jsonb)
story_clusters(id, run_id, canonical_title, meta jsonb)
cluster_articles(cluster_id, article_id)
stories(id, run_id, cluster_id, vertical, title, content_type, scores jsonb,
        verification jsonb, created_at)
editorial_drafts(id, story_id, channel, payload jsonb, created_at)
reviews(story_id, status, reviewed_at, notes)
media_assets(id, story_id, draft_id, type, path, provenance jsonb)
publications(id, story_id, draft_id, channel, target, status, scheduled_at,
             published_at, remote_id, remote_url)
pipeline_runs(id, mode, started_at, finished_at, stats jsonb)
analytics(publication_id, metric, value, captured_at)
```

Caminho de migração: implementar `SupabaseNewsRepository(NewsRepository)`,
rodar em paralelo com o JSON por alguns dias (dupla escrita), depois apontar o
dashboard para o Supabase e desligar a dupla escrita.
