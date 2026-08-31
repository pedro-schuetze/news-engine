# News Engine

Redação automatizada de notícias: coleta diária da internet, identificação dos
assuntos mais relevantes, classificação em verticais editoriais
(**Entretenimento**, **Política**, **Fatos Interessantes**), seleção de 3-5
stories por vertical e geração de drafts de Instagram (headline, caption e
carrossel com direção visual por slide) — tudo para revisão humana em um
dashboard local antes de qualquer publicação.

> **Objetivo do MVP:** avaliar se o engine escolhe boas notícias. A métrica é o
> approval rate no dashboard: das stories selecionadas, quantas você publicaria?

- Arquitetura: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Persistência futura (Supabase vs Turso+Cloudflare): [`docs/architecture/persistence.md`](docs/architecture/persistence.md)
- Memória viva do projeto (decisões, pendências, próximos passos): [`docs/CONTEXT.md`](docs/CONTEXT.md)

---

## Setup local

Pré-requisitos: **Python 3.11+** (CI usa 3.12) e **Node 20+** (para o dashboard).

```bash
# 1. ambiente Python
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/mac: source .venv/bin/activate)
pip install -r requirements.txt

# 2. configuração
copy .env.example .env          # Windows  (Linux/mac: cp .env.example .env)
# edite o .env e cole sua API key (ver seção "Configurar LLM")

# 3. teste sem custo (fixtures + LLM simulado)
python -m src.pipeline --mock

# 4. run real
python -m src.pipeline

# 5. dashboard
cd web
npm install
npm run dev                     # abre http://localhost:3000
```

## Configurar LLM

O pipeline funciona com **um** provider configurado; o outro é opcional (fallback).

### OpenAI (provider atual)

1. Crie uma key em <https://platform.openai.com/api-keys> (exige créditos na plataforma).
2. No `.env`: `LLM_PROVIDER=openai`, `OPENAI_API_KEY=sk-...`, `OPENAI_MODEL=gpt-5-mini`.
3. `OPENAI_REASONING_EFFORT=minimal` reduz custo/latência nos modelos gpt-5;
   deixe vazio para modelos que não suportam o parâmetro (ex.: gpt-4.1-mini).

### Anthropic / Claude (alternativa ou fallback)

1. **A API do Claude é separada da assinatura Claude Pro** — a assinatura do
   app não dá acesso à API. Crie uma conta/key em <https://console.anthropic.com>
   e adicione créditos.
2. No `.env`: `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=sk-ant-...`,
   `ANTHROPIC_MODEL=claude-haiku-4-5`.

### Fallback (opcional)

`LLM_FALLBACK_PROVIDER=anthropic` (ou `openai`): se o provider primário falhar
todas as tentativas de uma chamada, o fallback assume — desde que a key dele
também esteja configurada.

### Variáveis de ambiente (`.env`)

| Variável | Default | O que faz |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | provider primário (`anthropic` \| `openai`) |
| `LLM_FALLBACK_PROVIDER` | *(vazio)* | provider de reserva |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-haiku-4-5` | credenciais/modelo Claude |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-5-mini` | credenciais/modelo OpenAI |
| `OPENAI_REASONING_EFFORT` | `minimal` | esforço de raciocínio (família gpt-5) |
| `PIPELINE_MODE` | `live` | `mock` roda com fixtures + LLM simulado |
| `NEWS_LOOKBACK_HOURS` | `18` | janela de coleta |
| `MIN/MAX_STORIES_PER_VERTICAL` | `3`/`5` | quota de seleção |
| `TIMEZONE` | `America/Sao_Paulo` | exibição/nome de arquivos de run |
| `DATA_DIR` | `data` | onde os JSONs são gravados |

## Rodar o pipeline

```bash
python -m src.pipeline            # modo do .env (live por padrão)
python -m src.pipeline --mock     # fixtures + LLM simulado (custo zero)
python -m src.pipeline --lookback 6
```

Saídas:

- `data/latest.json` — último run completo (stats, stories, debug);
- `data/runs/YYYY-MM-DD_HHMMSS.json` — histórico (um arquivo por run);
- `data/reviews/<story_id>.json` — suas aprovações/rejeições (via dashboard).

## Dashboard

```bash
cd web && npm run dev   # http://localhost:3000
```

- Tabs por vertical, cards ordenados por score final com: headline sugerida,
  resumo, por que importa, fatos-chave, **fontes clicáveis**, carrossel completo
  (texto + direção visual + tipo de imagem por slide), caption, racional do
  engine (classificação, sub-scores, sinais de trend, fórmula) e verificação.
- **Approve / Reject / Reset** por story (grava em `data/reviews/`).
- Toggle **"Mostrar pipeline/debug"**: artigos coletados (com query e collector),
  removidos na deduplicação (com motivo), clusters (com sinais de trend),
  classificações do router (incluindo descartes e motivos), decisão de seleção
  por candidata e log de chamadas LLM.
- Métrica de qualidade: approval rate por vertical e total.

O dashboard é Next.js (pasta `web/`) preparado para deploy futuro na Vercel
(root directory = `web`). Hoje ele lê `data/*.json` do filesystem — em produção
será preciso trocar a fonte de dados (`web/src/lib/data.ts`); ver
`docs/CONTEXT.md` → pendências.

## Testes

```bash
pytest
```

Cobrem: normalização de URL/título, deduplicação, clustering, trend/final score,
seleção, schemas LLM (validação/retry/fallback com provider fake), parsers dos
collectors (XML/JSON fixos), repositório JSON, reviews e o pipeline inteiro em
modo mock. **Nenhum teste gasta créditos de API.**

## GitHub Actions (cron diário)

Workflow: [`.github/workflows/daily-news.yml`](.github/workflows/daily-news.yml)

- **Agendamento:** `cron: "0 9 * * *"` em UTC. O Actions não tem suporte oficial
  a timezone no `schedule`; como o Brasil não adota horário de verão desde 2019,
  09:00 UTC = **06:00 em São Paulo o ano todo**. O disparo pode atrasar alguns
  minutos (fila do GitHub).
- **Passos:** checkout → Python 3.12 → deps → `pytest` → `python -m src.pipeline`
  → commit automático de `data/latest.json` e `data/runs/` de volta no repo
  (permissão mínima: `contents: write`).

### Configurar Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Obrigatório? |
|---|---|
| `OPENAI_API_KEY` | sim (provider atual) |
| `ANTHROPIC_API_KEY` | só se usar Anthropic como primário/fallback |
| `LLM_PROVIDER` | opcional (default `openai`) |
| `LLM_FALLBACK_PROVIDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `OPENAI_REASONING_EFFORT` | opcionais |

Ou via CLI: `gh secret set OPENAI_API_KEY`.

### Executar manualmente

Aba **Actions → daily-news → Run workflow** (pode ajustar `lookback_hours`), ou:

```bash
gh workflow run daily-news
```

## Como adicionar…

- **Fonte RSS:** novo bloco em `config/sources.yaml` (nome, url do feed, domain,
  categoria, autoridade, idioma, `enabled: true`). Sem código.
- **Query de busca:** adicionar em `google_news_queries`/`gdelt_queries` da
  vertical em `config/verticals.yaml`.
- **Nova vertical (ex.: BUSINESS):** novo bloco em `config/verticals.yaml`
  (id, display_name, description, tone, queries, critérios, guidance, regras);
  opcionalmente pesos próprios em `config/ranking.yaml`
  (`final_blend_per_vertical`, `verification_per_vertical`). O router, o
  dashboard e a seleção passam a considerá-la automaticamente.
- **Trocar de LLM:** editar `LLM_PROVIDER`/modelo no `.env` (local) e nos
  Secrets (CI). Nomes de modelo nunca ficam no código.
- **Autoridade de um domínio:** tabela `domain_authority` em `config/sources.yaml`.

## Limitações atuais (conhecidas e documentadas)

- Links do Google News são redirects (o domínio real vem do feed; a URL final
  não é resolvida).
- Clustering não une idiomas diferentes do mesmo evento (mitigado pelo router;
  solução real: embeddings — fase futura).
- Reviews só funcionam com o dashboard rodando localmente (filesystem).
- Custo estimado usa tabela manual de preços (`src/config.py`) — ordem de
  grandeza, não contabilidade.
- Sem imagens/publicação/analytics nesta versão (modelos de dados já prontos).

## Roadmap

Ver **`docs/CONTEXT.md`** — imediato: primeiro run real + calibração de
thresholds; curto prazo: Vercel + fontes extras; médio prazo: Supabase, renderer
de imagens com templates, publicação via Instagram Graph API, breaking news,
analytics com feedback no ranking.
