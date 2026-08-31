# CONTEXT.md — memória viva do projeto

> Documento de contexto para humanos e para futuras sessões de Claude Code.
> Atualizar a cada sessão de trabalho relevante: o que mudou, decisões, pendências.

**Projeto:** News Engine — redação automatizada que coleta notícias diariamente,
seleciona as melhores por vertical editorial (Entretenimento, Política, Fatos)
e gera drafts de posts de Instagram (headline, caption, carrossel com direção
visual por slide) para revisão humana.

**Dono:** Pedro (projeto pessoal). **Métrica-guia do MVP:** approval rate — das
3-5 stories por vertical, quantas o Pedro realmente publicaria?

---

## Estado atual (2026-08-30)

MVP v0.1 implementado de ponta a ponta nesta primeira sessão:

- Pipeline Python completo: collect (Google News RSS + GDELT + RSS curado) →
  normalize → dedupe → cluster → trend score → router LLM → score editorial →
  verificação → seleção → drafts → JSON.
- Modo mock de primeira classe (`--mock`): fixtures + LLM simulado, custo zero.
- Dashboard **Next.js** em `web/` (não Streamlit — ver decisão 2): tabs por
  vertical, cards com fontes/carrossel/racional, approve/reject, modo debug,
  métrica de approval rate.
- GitHub Actions diário (09:00 UTC = 06:00 BRT) com commit dos JSONs.
- Testes pytest (unidade + integração mock).
- Repo: `pedro-schuetze-artica/news-engine` (privado, namespace pessoal da
  conta de trabalho, FORA da organização artica-capital — pedido do Pedro).

## Decisões tomadas (com data e porquê)

1. **2026-08-30 — Escopo geográfico:** ENTERTAINMENT e FACTS cobrem global +
   Brasil (coleta em EN e PT); POLITICS só Brasil (eleições 2026 em destaque).
   Toda redação final em PT-BR. *(Decisão do Pedro via pergunta.)*
2. **2026-08-30 — Dashboard em Next.js, não Streamlit:** Pedro pediu no meio da
   implementação ("quero no vercel; local por enquanto"). `web/` roda local com
   `npm run dev` lendo `data/*.json`; deploy na Vercel fica para depois (ver
   pendências — escrita de reviews em serverless precisa de outra fonte).
3. **2026-08-30 — LLM primário = OpenAI** (`gpt-5-mini`, reasoning_effort
   minimal): Pedro só tem key da OpenAI hoje. Anthropic implementado e pronto
   (`claude-haiku-4-5` default) para virar primário ou fallback quando houver key.
4. **2026-08-30 — Imagens na v1 = direção visual por slide** (descrição do que
   a foto/arte deve mostrar + tipo de fonte sugerido). Nada de download nem
   geração de imagem; provenance/direitos preservados no modelo MediaAsset.
   Regra dura: nunca sugerir IA fotorrealista de político real.
5. **2026-08-30 — Verticais como configuração** (verticals.yaml), não módulos
   por vertical. Adicionar BUSINESS/TECH/etc. = editar YAML.
6. **2026-08-30 — Verificação em duas camadas:** estrutural determinística
   (fontes independentes, domínio oficial, regras por vertical em ranking.yaml;
   POLITICS: UNVERIFIED é excluída da seleção) + sinais qualitativos do LLM de
   carona na chamada de score (economia de chamadas).
7. **2026-08-30 — Persistência futura: Supabase** (análise completa em
   `docs/architecture/persistence.md`); se egress de imagem pesar, só o storage
   migra para R2 atrás de `MediaStorage`.
8. **2026-08-30 — Python 3.11 local / 3.12 no CI** (máquina do Pedro tem 3.11.9;
   código compatível com ambos).
9. **2026-08-30 — Runs com timestamp no nome** (preparação para múltiplos
   runs/dia — breaking news futuro).

## Pendências / dívidas conhecidas

- [ ] **OPENAI_API_KEY não configurada ainda** — Pedro vai colar no `.env`
      (local) e em Settings → Secrets → Actions (GitHub) para o cron funcionar.
- [ ] **Reviews em produção:** o dashboard na Vercel não poderá gravar reviews
      no filesystem. Caminhos: (a) commit via GitHub API, (b) Supabase (preferido,
      já decidido para a fase 2). Local funciona 100%.
- [ ] **Leitura de dados na Vercel:** `web/src/lib/data.ts` lê filesystem; para
      produção, trocar por fetch dos JSONs no GitHub (raw + token) ou Supabase.
      Só esse arquivo muda.
- [ ] **Feeds RSS desativados por incerteza de URL** (`enabled: false` em
      sources.yaml): Agência Câmara, Agência Senado, Omelete. Confirmar URLs e ligar.
- [ ] **Links do Google News são redirects** (news.google.com/...): domínio real
      vem do feed, mas o clique passa pelo redirect. Resolver URL final = melhoria.
- [ ] **Clustering não cruza idiomas** (EN vs PT do mesmo evento podem virar 2
      clusters; o router LLM descarta duplicatas dentro do batch, mas não entre
      batches). Solução real: embeddings multilíngues.
- [ ] **Custo estimado usa tabela manual de preços** em `src/config.py` —
      atualizar quando trocar de modelo.
- [ ] Primeiro run live ainda não executado (aguardando key). Depois do primeiro
      run real, calibrar: thresholds (`min_final_score`), pesos do trend,
      threshold de similaridade do cluster, queries por vertical.

## Próximos passos

### Imediatos (esta semana)
1. Pedro: colar `OPENAI_API_KEY` no `.env` → rodar `python -m src.pipeline` →
   abrir dashboard (`cd web && npm run dev`) → revisar as stories do primeiro run real.
2. Configurar secret `OPENAI_API_KEY` no GitHub e disparar o workflow manualmente
   (Actions → daily-news → Run workflow) para validar o cron de ponta a ponta.
3. Usar o dashboard por alguns dias e ajustar queries/thresholds com base no que
   aparecer de ruim (o modo debug mostra por que cada decisão foi tomada).

### Curto prazo (2-6 semanas)
- Calibração de ranking com o approval rate acumulado (meta: >70% por vertical).
- Ligar/expandir fontes RSS (confirmar feeds oficiais Câmara/Senado; adicionar
  fontes de entretenimento BR melhores que fofoca).
- Resolver URLs finais do Google News.
- Linkar `web/` na Vercel (leitura via GitHub raw) — reviews continuam locais
  até o Supabase.
- Avaliar segundo run diário (ex.: 15:00) antes de investir em breaking news.

### Médio/longo prazo (fase 2+)
- **Supabase**: implementar `SupabaseNewsRepository` (dupla escrita JSON+DB na
  transição) + reviews via dashboard em produção.
- **Imagens**: pipeline Story → CarouselSpecification → renderer com template
  determinístico (HTML/CSS→PNG 1080x1350; IA só para arte, nunca layout/texto)
  → `MediaStorage`.
- **Publicação Instagram** (Graph API) com modelo Publication já pronto;
  1 conta por vertical (targets em múltiplos canais já modelados).
- **Breaking news**: workflow horário + threshold de trend para runs extra.
- **Analytics** de performance real alimentando o editorial score (feedback loop).
- Novas verticais (BUSINESS, TECH, SPORTS...) — só YAML.

## Como retomar o trabalho (para futuras sessões)

```bash
# testes e run simulado (sem custo)
.venv\Scripts\python -m pytest
.venv\Scripts\python -m src.pipeline --mock

# run real (precisa de OPENAI_API_KEY no .env)
.venv\Scripts\python -m src.pipeline

# dashboard
cd web && npm run dev   # http://localhost:3000
```

Arquivos que definem comportamento editorial: `config/verticals.yaml` (o que é
cada vertical), `config/ranking.yaml` (pesos/thresholds/verificação),
`config/sources.yaml` (fontes e autoridade). Prompts em `src/llm/prompts.py`.
