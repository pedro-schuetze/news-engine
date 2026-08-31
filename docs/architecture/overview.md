# News Engine — Visão de Arquitetura

**Objetivo do MVP:** responder "o News Engine consegue consistentemente escolher boas notícias?" —
medido pela taxa de aprovação humana no dashboard (reviews locais).

## Pipeline

```
COLLECT (google_news | gdelt | rss curado)      <- barato, resiliente por fonte
   v
NORMALIZE (títulos, URLs sem tracking, datas)    <- determinístico
   v
DEDUPLICATE (urls, títulos, syndication)         <- determinístico (rapidfuzz)
   v
CLUSTER (mesmo acontecimento -> StoryCluster)    <- determinístico (fuzzy + entidades)
   v
TREND SCORE (fórmula explícita, ranking.yaml)    <- determinístico
   v
EDITORIAL ROUTER (vertical ou discard)           <- LLM em batch (pool limitado)
   v
EDITORIAL SCORE por vertical                     <- LLM em batch (top N por trend)
   v
VERIFY (regras por vertical + sinais do LLM)     <- determinístico + carona no LLM
   v
FINAL SCORE = blend(trend, editorial) - penalidade de verificação
   v
SELECT (3-5 por vertical; nunca preenche quota com ruim)
   v
DRAFT (headline, caption, carrossel c/ direção visual por slide)  <- LLM, 1/story
   v
SAVE (JSON via NewsRepository) -> dashboard Next.js -> REVIEW humana
```

Fases futuras (não implementadas, mas com modelos prontos): GENERATE MEDIA ->
SCHEDULE -> PUBLISH -> ANALYTICS -> feedback no ranking.

## Entidades

| Entidade        | O que é                                            | Onde vive          |
| --------------- | -------------------------------------------------- | ------------------ |
| `Article`       | uma matéria coletada de uma fonte                  | `src/models.py`    |
| `StoryCluster`  | grupo de Articles sobre o MESMO acontecimento      | idem               |
| `Story`         | o fato editorial consolidado, com scores e fontes  | idem               |
| `EditorialDraft`| um formato de conteúdo (carrossel IG) de uma Story | idem               |
| `Review`        | avaliação humana, separada da Story                | `data/reviews/`    |
| `MediaAsset`    | mídia com provenance/direitos (futuro)             | modelo pronto      |
| `Publication`   | publicação em canal (futuro)                       | modelo pronto      |
| `PipelineRun`   | um run completo com stats e debug                  | `data/runs/*.json` |

Uma Story pode ter N Articles como fonte e, no futuro, N EditorialDrafts
(carrossel, Reel, site, newsletter) e N Publications (canais). Nunca tratamos
notícia == post.

## Abstrações deliberadas (e só elas)

Regra aplicada: *abstract where future replacement is already clearly known.*

- **`LLMProvider`** (`src/llm/base.py`) — Anthropic / OpenAI / Mock. Troca via env.
  O `LLMClient` centraliza JSON estrito + validação Pydantic + retries + fallback + contagem de custo.
- **`NewsRepository`** (`src/repositories/base.py`) — JSON hoje, Supabase amanhã.
  Pipeline e dashboard não conhecem arquivos.
- **`MediaStorage`** (`src/media/base.py`) — local hoje, Supabase Storage/R2 amanhã.
- **`Collector`** (`src/collectors/base.py`) — cada fonte é independente; a falha de uma não derruba o run.

Fora isso, código direto e simples — sem framework interno, sem filas, sem DB.

## Decisões relevantes (e desvios do spec original)

1. **Verticais são configuração, não código.** O spec sugeria `editorial/entertainment.py` etc.;
   três módulos quase idênticos virariam boilerplate. Tudo que difere entre verticais
   (queries, critérios, tom, regras, domínios oficiais) vive em `config/verticals.yaml`,
   e os prompts são montados a partir disso. Adicionar vertical = editar YAML.
2. **Verificação LLM pega carona no score editorial.** Em vez de uma chamada extra por
   vertical, os sinais qualitativos (rumor/claim, contradições, notas) saem na mesma
   chamada de score. A verificação estrutural (contagem de fontes independentes,
   fonte oficial, regras POLITICS) é determinística em `processing/verify.py`.
3. **Runs com timestamp** (`data/runs/YYYY-MM-DD_HHMMSS.json`) em vez de só data —
   o spec pede preparação para múltiplos runs/dia (breaking news futuro).
4. **Links do Google News não são resolvidos** (são redirects). O domínio real vem da
   tag `<source>` do feed — suficiente para dedupe/cluster/autoridade/auditoria.
   Resolver a URL final fica como melhoria (ver CONTEXT.md).
5. **Clustering não cruza idiomas.** Fuzzy + entidades não une "X buys Y" com
   "X compra Y" de forma confiável; o router LLM recebe instrução de descartar
   duplicatas semânticas dentro do batch. Solução definitiva: embeddings multilíngues (futuro).
6. **Dashboard em Next.js (web/), não Streamlit** — decisão do Pedro durante a
   implementação, para poder linkar na Vercel depois. Local: lê `data/*.json` do
   filesystem e grava reviews nos mesmos arquivos que o repo Python usa. Em produção
   (Vercel) a camada `web/src/lib/data.ts` precisa trocar filesystem por fonte remota.
7. **Python 3.11+ localmente, 3.12 no CI.** A máquina local tem 3.11.9; o código não
   usa nada exclusivo do 3.12.
8. **Mock mode de primeira classe** (`--mock`): fixtures realistas + `MockProvider`
   determinístico que parseia os próprios prompts. CI e testes nunca gastam API.

## Controle de custo (spec §25)

Tudo que pode ser resolvido sem LLM acontece antes do LLM. O LLM é chamado em
3 pontos, sempre com pool limitado e em batch:

| Chamada             | Quando                          | Volume típico/run |
| ------------------- | ------------------------------- | ----------------- |
| classification      | top ~30-60 clusters, 15/batch   | 2-4 chamadas      |
| editorial_score     | top 10 por vertical, 1/vertical | 3 chamadas        |
| draft               | 1 por story selecionada         | 9-15 chamadas     |

Total ≈ 15-22 chamadas/run. Com `gpt-5-mini` ou `claude-haiku-4-5`, centavos por run.
`stats` registra chamadas, tokens (uso real da API) e custo estimado (tabela de preços
em `src/config.py`).

## Pontos de extensão

- **Nova vertical:** bloco novo em `verticals.yaml` (+ pesos opcionais em `ranking.yaml`).
- **Nova fonte RSS:** entrada em `sources.yaml`.
- **Novo collector:** subclasse de `Collector`, registrada em `pipeline._build_collectors`.
- **Novo provider LLM:** subclasse de `LLMProvider` + case no `build_llm_client`.
- **Persistência real:** implementar `NewsRepository` (ver persistence.md).
- **Breaking news:** `run_pipeline` já é reentrante e os runs têm timestamp; falta só
  um segundo workflow com cron mais frequente + threshold de trend.
