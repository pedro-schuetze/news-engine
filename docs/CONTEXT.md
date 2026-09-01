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
- Dashboard **Next.js** em `web/` (não Streamlit — ver decisão 2), redesenhado
  em 2026-08-31 (decisão 10): sidebar com Dashboard / Posts de hoje / Histórico
  / Configurações; cards com fontes/carrossel/racional, approve/reject com
  copiar-caption, filtros no histórico, modo debug por run, approval rate.
- GitHub Actions diário (09:00 UTC = 06:00 BRT) com commit dos JSONs.
- Testes pytest (unidade + integração mock).
- Repo: `pedro-schuetze-artica/news-engine` (privado, namespace pessoal da
  conta de trabalho, FORA da organização artica-capital — pedido do Pedro).
- **Primeiro run real executado em 2026-08-30 ~23:28 BRT:** 1.438 artigos
  coletados (GN 1.182 / GDELT 60 / RSS 196) → 1.307 pós-dedupe → 697 clusters
  → 60 no pool LLM → 15 stories (5/5/5), 23 chamadas, US$ 0,058, ~9 min.
  Bugs corrigidos na sequência: User-Agent com acento derrubava TODO collector
  (headers HTTP são ASCII — teste de regressão adicionado) e o mesmo
  acontecimento podia virar 2 stories na mesma vertical (caso real: telescópio
  Roman em facts #1 e #2) — resolvido com detecção de duplicata na chamada de
  score editorial (`duplicate_of_index`, custo zero).

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
10. **2026-08-31 — Redesign UX/UI do dashboard** (pedido do Pedro, foco em
    usabilidade). Referências: **column.com** (refero 509 — paleta favorita:
    branco/papel, hairlines #E3E4E8, tinta #12161E, navy #111A4A em títulos,
    verde #167E6C primário, microlabels monospace) + runey.app (refero 883 —
    cantos arredondados, chips pill). Arquitetura: **sidebar** com 4 páginas —
    Dashboard (visão geral + approval rate), Posts de hoje (fluxo de revisão),
    Histórico (banco de stories com filtros status/vertical/busca + lista de
    runs com detalhe) e Configurações (leitura de .env não-sensível + YAMLs).
    Verticais com código de cor (laranja/azul/roxo); verde reservado para
    marca/aprovação. Debug acessível dentro da página de cada run. Tipografia:
    Inter + IBM Plex Mono (next/font). Tema claro único.
11. **2026-08-31 — Vercel na conta PESSOAL do Pedro, isolada por projeto.**
    Nunca usar `vercel login` nesta máquina (o login global é da conta
    profissional dele): tudo via `VERCEL_TOKEN` do `.env` + `--token`, projeto
    linkado em `web/.vercel/` (gitignored). Dados em produção: fonte `github`
    (Contents API + ETag; reviews viram commits `review: STATUS id`). Git
    integration para auto-deploy por push. Supabase segue como fase 2 — quando
    entrar, vira uma terceira fonte em `web/src/lib/sources/`.

## Pendências / dívidas conhecidas

- [x] ~~OPENAI_API_KEY no `.env` local~~ — configurada em 2026-08-30.
- [ ] **Secret `OPENAI_API_KEY` no GitHub Actions ainda falta** — sem ele o cron
      diário (06:00 BRT) falha. `gh secret set OPENAI_API_KEY --repo pedro-schuetze-artica/news-engine`.
- [ ] **GDELT instável:** 2 de 3 queries deram timeout no primeiro run real
      (pipeline seguiu normalmente). Observar; se persistir, aumentar timeout
      só do GDELT ou reduzir a 1 query por vertical.
- [ ] **Router não vê duplicatas entre batches diferentes** (60 clusters ÷ 15
      por batch); a rede de segurança é a detecção no score editorial, que vê
      os 10 finalistas da vertical juntos. Se ainda escapar duplicata, unificar
      a classificação em 1 chamada maior.
- [x] ~~Reviews e leitura de dados na Vercel~~ — resolvido em 2026-08-31
      (decisão 11): fonte dual `fs`/`github` em `web/src/lib/sources/`; produção
      lê via GitHub Contents API (cache ETag) e grava reviews como commits.
- [x] ~~Deploy na Vercel~~ — projeto `news-engine` criado no time
      **`artica1`**, que — APESAR DO NOME "Artica123" — é o **time Hobby
      PESSOAL** do Pedro (confirmado por ele em 2026-08-31; a conta
      profissional é OUTRA conta Vercel, linkada ao GitHub
      pedro-schuetze-artica, nunca tocada por aqui). Operação sempre via
      `VERCEL_TOKEN` do `.env` + `--scope artica1`; nunca `vercel login`.
      Envs de produção: NEWS_DATA_SOURCE=github, NEWS_GITHUB_REPO
      (=pedro-schuetze-artica/news-engine enquanto o repo não for
      transferido), NEWS_GITHUB_BRANCH=main.
- [x] ~~GITHUB_TOKEN nas envs da Vercel~~ — configurado pelo Pedro em
      2026-08-31; LEITURA funcionando em produção (site carrega runs do repo
      em tempo real, sem redeploy).
- [x] ~~Token Contents: Read-only~~ — Pedro ajustou para Read and write em
      2026-08-31; write validado EM PRODUÇÃO com reviews reais (commits
      `review: APPROVED/REJECTED ...` no repo). Sistema 100% operacional.
- [x] ~~Validação ponta a ponta do fluxo automático~~ (2026-08-31 noite):
      secret OPENAI_API_KEY corrigido → run manual do Actions 100% verde
      (pipeline live + commit de dados) → site refletiu o run novo na hora
      (leitura via API) → auto-deploy por push READY. Ajuste necessário no
      caminho: commits de dados do Actions agora usam a identidade pessoal
      do Pedro (a Vercel bloqueava o autor bot com TEAM_ACCESS_REQUIRED).
      Git integration ativa com root directory `web`.
- [x] ~~Primeiro deploy em produção~~ — **https://news-engine-six.vercel.app**
      (2026-08-31, projeto artica1/news-engine, READY, modo github ativo).
      Dois obstáculos resolvidos no caminho: (1) env vars criadas via
      `vercel env add` com pipe do PowerShell carregavam `\r` no valor,
      quebrando `NEWS_DATA_SOURCE === "github"` — recriadas via API REST +
      `.trim()` defensivo no código; (2) deploy BLOCKED por
      TEAM_ACCESS_REQUIRED (autor dos commits era o e-mail de TRABALHO,
      `pedro.andrade@artica.capital`) — o repo agora tem git config LOCAL com
      a identidade pessoal (`pedro-schuetze@users.noreply.github.com`), que a
      Vercel aceita; o git config global (trabalho) segue intocado.
- [ ] **Cron de 2026-08-31 06:03 falhou: a key do secret `OPENAI_API_KEY` do
      GitHub é de um projeto OpenAI SEM acesso ao gpt-5-mini** (403
      model_not_found; a key local — env var de usuário do Windows, não no
      .env — é outra e funciona). Fix: Pedro atualizar o secret com a mesma
      key local, OU liberar o modelo para o projeto no console da OpenAI, OU
      setar secret `OPENAI_MODEL` para um modelo acessível. Coleta no CI
      funcionou (1.367 artigos); o abort foi limpo, sem commit de lixo.
- [x] ~~Transferir o repo para o GitHub pessoal~~ — feito pelo Pedro em
      2026-08-31: agora é **`pedro-schuetze/news-engine`**. A transferência
      preservou o secret `OPENAI_API_KEY` e o workflow (ativo), e deixou a
      conta `pedro-schuetze-artica` como collaborator com push — o git local
      continua autenticando com a credencial existente, sem popup. Remote,
      default `NEWS_GITHUB_REPO` no código, User-Agent do collector, README e
      env da Vercel atualizados para o novo caminho.
- [ ] **Git integration na Vercel (Pedro, opcional):** agora possível —
      dashboard da Vercel → projeto news-engine → Settings → Git → conectar
      `pedro-schuetze/news-engine` (root directory `web`) para auto-deploy
      por push.
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
1. Pedro: revisar as 15 stories do primeiro run real no dashboard
   (`cd web && npm run dev`) — approve/reject alimenta o approval rate.
2. Configurar secret `OPENAI_API_KEY` no GitHub e disparar o workflow manualmente
   (Actions → daily-news → Run workflow) para validar o cron de ponta a ponta.
3. Usar o dashboard por alguns dias e ajustar queries/thresholds com base no que
   aparecer de ruim (o modo debug mostra por que cada decisão foi tomada).
   Atenção: a partir do 2º run, o sinal de **novelty** penaliza stories já
   selecionadas em runs anteriores — repetição cai de ranking por design.

### Curto prazo (2-6 semanas)
- Calibração de ranking com o approval rate acumulado (meta: >70% por vertical).
- Ligar/expandir fontes RSS (confirmar feeds oficiais Câmara/Senado; adicionar
  fontes de entretenimento BR melhores que fofoca).
- Resolver URLs finais do Google News.
- Linkar `web/` na Vercel (leitura via GitHub raw) — reviews continuam locais
  até o Supabase.
- Avaliar segundo run diário (ex.: 15:00) antes de investir em breaking news.

### Etapa 2 — geração automática dos posts (decisões de 2026-08-31, aguardando prints)

Decidido com o Pedro:
- **Visual text-first COM imagem obrigatória**: tipografia grande domina a
  hierarquia (referência: the news), mas TODO slide tem zona visual — foto de
  fonte limpa ou ilustração. Fallback garantido: se não houver foto limpa,
  ilustração por IA (nunca pessoa real) — a automação nunca trava sem imagem.
- **Fontes de imagem**: Wikimedia Commons (pessoas públicas, com atribuição),
  Unsplash/Pexels via API (conceitos), IA para ilustração. Provenance no
  MediaAsset. og:image de matéria NÃO entra (nem como candidata).
- **Renderer**: satori/@vercel/og no web app — templates JSX determinísticos
  → PNG 1080x1350 on-demand, preview renderizado no dashboard, URL pública
  por slide (pronta para a Graph API do Instagram na fase 3).
- **Storyline 5 slides por vertical** (gancho → contexto → fato central →
  consequência → fecho+CTA), texto NA imagem curto (slide 1 = manchete;
  demais ≤ ~25 palavras); a legenda complementa/aprofunda — o post precisa
  se sustentar sozinho nas imagens.
- **Contas-modelo**: the news, curioso mercado, the bating. BLOQUEADO
  aguardando o Pedro colar prints de 2-3 posts ideais de cada — templates e
  ajuste fino do storyline só depois disso (não repetir o erro do refero).

**Fase 1 ENTREGUE (2026-09-01):** prints recebidos (bating = capa
manchete-caps + internos serifados c/ negrito; the news = highlight colorido;
curioso = sobriedade serif, menos texto que o exemplo). Renderer no ar:
`GET /api/slide/{story}/{n}?run=` → PNG 1080x1350 (satori/next-og, fontes
Archivo Black + Lora + Plex Mono vendoradas), templates capa/interno/fecho
com marca, tag colorida por vertical, paginação, CTA e crédito; sourcing
keyless Wikimedia→Openverse com cascata de queries (entidades → nome →
contexto da vertical — post é SEMPRE visual) e provenance/crédito
sanitizado; preview renderizado no StoryCard; validado em produção.

**Fase 2 ENTREGUE (2026-09-01)** — feedback do Pedro nas primeiras amostras
(imagem irrelevante, texto sem contraste, legenda curta) endereçado:
- **Relevância de imagem**: banco só entrega foto se uma ENTIDADE FORTE da
  story aparecer no título do arquivo + blacklist de gráfico/mapa/logo. Antes
  vinha gráfico de pizza em post de cantor.
- **Ilustração por IA** quando o banco não tem match: `gpt-image-2` medium
  (default; env `OPENAI_IMAGE_MODEL`/`OPENAI_IMAGE_QUALITY`). Medido contra
  gpt-image-1-mini na mesma cena: mini saiu escuro/vazio e sumia sob o scrim;
  image-2 ~US$ 0,041/imagem (vs 0,013) e mais rápido. É 1 imagem por POST
  (não por slide) e só quando falta foto → teto ~US$ 18/mês.
  Prompt proíbe texto, logos e pessoa real identificável.
- **Contraste**: scrim de duas camadas (véu + faixa) num único elemento —
  satori NÃO renderiza Fragment com filhos absolutos, era por isso que o
  escurecimento não aplicava. Sombras reforçadas.
- **Uma imagem por story** em todos os slides (evita foto de pessoa errada no
  interno, dá coerência de post, corta custo de IA em 5x).
- **Legenda longa**: 3-5 parágrafos, 150-280 palavras, com informação NOVA e
  atribuição às fontes; slides ficaram curtos com **negrito** nos dados.
- **Precedência de key**: `.env` da raiz vence env var do processo TAMBÉM no
  web (`images.ts`) — a env var antiga do Windows apontava para projeto
  OpenAI sem acesso a imagem e mascarava a key correta (mesmo bug do Python).
- Envs de produção na Vercel: OPENAI_API_KEY, OPENAI_IMAGE_MODEL=gpt-image-2,
  OPENAI_IMAGE_QUALITY=medium (configuradas via API com o VERCEL_TOKEN).

**Fase 3 ENTREGUE (2026-09-01)** — feedback do Pedro sobre os carrosséis
prontos, ponto a ponto:
- **Imagens iguais nos 5 slides** (consequência da decisão "1 imagem por
  story"): relevância agora exige o nome COMPOSTO ("Lionel Richie", não
  "Richie" — que trouxe outra pessoa), então o banco pode devolver várias
  fotos do mesmo assunto; e com uma imagem só, cada slide tem enquadramento
  próprio (zoom + ponto de interesse em `FRAMINGS`, render.tsx).
- **Ilustração PRÉ-GERADA no run** (`src/media/illustrator.py`): gera, comprime
  para JPEG (~70-185KB em vez de ~1MB), analisa e salva em `data/media/`
  (versionado no git; o dashboard lê por fs local ou GitHub API). Dashboard não
  espera geração e o custo fica travado em 1 imagem por post. Stats novos:
  `illustrations_generated`, `estimated_image_cost_usd`.
- **Posição do texto por análise de imagem** (o "sonho" do Pedro): Pillow mede
  luminância e desvio em 3 faixas x 3 terços e escolhe a região mais escura e
  uniforme; grava `text_placement` (TOP/CENTER/BOTTOM) e `text_align`
  (left/center/right) no MediaAsset. O renderer move o texto E a faixa escura
  para lá; mantém centralizado quando o ganho não é claro. No run de validação
  a escolha variou de verdade (bottom/left, top/center, center/left...).
- **Escrita humanizada**: regras da skill `humanizer` (Wikipedia "Signs of AI
  writing") traduzidas para PT-BR editorial no prompt do writer. Travessão
  proibido, lista de vocabulário-clichê, sem gerúndio de análise falsa, sem
  paralelismo negativo, sem regra de três, sem conclusão motivacional. Run de
  validação: ZERO tells nas 15 legendas, média de 138 palavras.
- **Manchete com gramática completa**: regra explícita usando o caso apontado
  pelo Pedro ("Cérebro sincroniza com sua respiração" -> "Estudo mostra que o
  cérebro sincroniza com a respiração"), com origem do fato na manchete.

Run de validação (2026-09-01 15:20): 1.679 artigos → 15 posts, US$ 0,068 de
LLM + US$ 0,618 de imagens = US$ 0,69.

**Fase 4 ENTREGUE (2026-09-01)** — imagens SOB DEMANDA, a pedido do Pedro:
- O run automático gera só texto. Nenhuma imagem é produzida para post que
  pode ser rejeitado (`GENERATE_ILLUSTRATIONS=false`; o passo no pipeline saiu).
- Cada slide tem imagem PRÓPRIA (antes era a mesma arte com zoom variado, que
  era exatamente o que ele não queria): `Story.slide_media` é uma lista, uma
  entrada por slide.
- Dois caminhos no card do post (`web/src/components/ImageActions.tsx`):
  (1) **API** — `POST /api/media/{story}` busca no banco e usa IA só no que
  falta, em paralelo; (2) **ChatGPT** — "copiar prompt" monta um briefing com a
  direção visual de cada slide (`lib/media/briefing.ts`) para usar com a skill
  `skills/news-engine-carousel` (zip pronto para instalar), e
  `POST /api/media/{story}/upload` traz as imagens de volta.
- Persistência: filesystem em dev; em produção um COMMIT ÚNICO via Git Trees
  API (`lib/media/persist.ts`) — 5 PUTs isolados gerariam 5 commits.
- Análise de contraste portada para TS (`jpeg-js`), aplicada nos dois caminhos.
- BUG IMPORTANTE corrigido: o extrator de entidades ignorava a primeira palavra
  do título, então "Lionel Richie volta a passar mal" virava só "Richie" e
  trouxe a foto de Richie McCaw. Agora a primeira palavra entra, o nome
  composto é exigido e entidades de uma palavra passam por lista de termos
  genéricos de manchete.

**Fase 5 ENTREGUE (2026-09-01)** — composição manual e ajustes:
- `prompts/*.md`: regras editoriais (headline, humanize, slides, caption) saíram
  do código e agora são lidas pelo pipeline Python E pelo dashboard. Fonte única.
- **Gerar post de link** (`/gerar` + `POST /api/compose`): extrai og:tags/título/
  parágrafos da matéria, o LLM escolhe a vertical (o editor pode trocar) e o
  resultado é salvo como run `manual_*.json` — assim aparece em Prontos,
  Histórico e export sem código novo. `DELETE /api/compose?run=` descarta.
- **Pedir ajustes** (`POST /api/adjust/{story}`): direcionamento curto reescreve
  o texto; imagens são PRESERVADAS (decisão do Pedro). Checkbox "aprender para
  os próximos" grava em `data/learned.json`, injetado nos prompts por vertical.
- `lib/compose/persistRun.ts` centraliza a gravação do run (latest + arquivo do
  histórico) para ajuste, composição e descarte.
- Validado: ajuste reescreveu com atribuição explícita e manteve as 5 imagens;
  composição de um link da Billboard classificou como entertainment com 5 slides
  e legenda de 153 palavras; descarte removeu o run.

Próximos passos:
1. Instalar a skill `news-engine-carousel` no ChatGPT e validar o caminho
   manual de ponta a ponta (gerar lá, subir aqui).
2. Observar se os direcionamentos aprendidos (`data/learned.json`) melhoram os
   runs seguintes; hoje eles entram no prompt do writer (não na seleção).
2. Writer v2: `cover_highlight` (destaque colorido na manchete, estilo the news).
3. Sourcing extra (opcional): Unsplash/Pexels para conceitos.
4. Observar: no run de validação o router descartou 0 de 60 clusters (antes
   descartava 2-3). Vale checar se o prompt de classificação ficou permissivo.
5. Fase 3: publicação — a Graph API do Instagram consome exatamente as URLs
   de /api/slide já existentes.

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
