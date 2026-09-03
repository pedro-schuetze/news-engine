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

12. **2026-09-02 — Gatilho do run diário sai do cron do GitHub e vai para o
    cron da Vercel.** Em 02/09 o run das 09:00 UTC não foi criado: sem erro,
    sem fila, sem registro — workflow `active`, cron intacto, repo público (e
    portanto com minutos ilimitados). O `schedule:` do Actions é best-effort.
    Outro projeto do Pedro com o mesmo desenho tem 4 meses de medição do
    mesmo sintoma: atraso de 24 a 740 min na CRIAÇÃO do run, piores nas
    segundas, com o job sempre terminando em 12-16 min — é prioridade de fila,
    não código. Lá a saída foi um agendador dentro do banco; aqui, como este
    projeto deliberadamente não tem banco, o gatilho é
    o cron da Vercel (`web/vercel.json`) chamando `/api/cron/run`, que faz
    `workflow_dispatch`. Evento vindo da API entra na mesma fila de um `push`
    e sobe em segundos. O executor não muda de lugar: o pipeline continua no
    Actions, que é onde há Python e permissão de commitar em `data/`.
    - Autenticação: `CRON_SECRET` nas env vars da Vercel (ela manda
      `Authorization: Bearer $CRON_SECRET` nas chamadas de cron). Sem o
      segredo a rota responde 401 e não dispara nada — endpoint aberto aqui
      gastaria crédito de API e commitaria no repo a cada visita de robô.
    - O `schedule:` do GitHub fica como REDE DE SEGURANÇA às 11:00 UTC (08:00
      BRT), duas horas depois, porque no plano Hobby o cron da Vercel dispara
      dentro da hora, não no minuto.
    - Guard de idempotência no workflow: se `data/runs/<hoje>_*.json` já
      existe, o job encerra em ~15s de runner. Input `force: true` ignora o
      guard. O `concurrency` que já existia é o que faz o guard funcionar
      quando os dois gatilhos sobem juntos (o segundo faz checkout depois do
      commit do primeiro).
    - Janela do cron = 26h, não as 18h de antes: com run 1x/dia, 18h deixava
      um vão de 6h POR DIA (o run das 09:00 cobre desde as 15:00 do dia
      anterior, e o run anterior parou às 09:00 — ninguém olhava 09:00-15:00).
      Custo praticamente igual: o clustering é local e as chamadas ao LLM são
      limitadas por config, não pelo volume coletado (medido em 02/09 com 24h:
      1.783 artigos, 22 chamadas, US$ 0,069).

13. **2026-09-02 — Vertical POLITICS troca de escopo: política BR → Mundo
    (política e economia internacionais).** Pedido do Pedro, com exemplos do
    que deve entrar: aliança Paquistão/Arábia Saudita/Turquia, PIB da Índia
    (+7,8%), referendo da Islândia sobre a UE, acordo Senegal-FMI, cúpula de
    Xangai (Putin-Trump-Xi), trote no premiê britânico. Repare: 2 dos 6
    exemplos são ECONOMIA global — o escopo é "mundo", não só política. Nome
    de exibição: **Mundo** (escolha do Pedro entre Mundo/Internacional/
    Geopolítica).
    - O **id interno continua `politics`**, de propósito: runs antigos,
      reviews, cores do dashboard e as regras de `ranking.yaml`
      (verification_per_vertical, blend 30/70 trend/editorial) referenciam o
      id, e o rigor de verificação/atribuição vale igual para geopolítica.
      Custo aceito: runs antigos de política BR aparecem no histórico sob o
      rótulo novo "Mundo" (cosmético).
    - Política doméstica brasileira ficou SEM canal (eleições 2026 inclusive)
      — decisão consciente do Pedro; se voltar, é criar vertical nova no
      YAML e religar Poder360/Câmara/Senado em sources.yaml.
    - Brasil entra só como ator externo (cúpulas, acordos, disputas
      comerciais).
    - Fontes novas (testadas 200 OK em 2026-09-02): BBC World, Guardian
      World, Al Jazeera EN, DW Brasil (PT). Poder360 desligado.
      domain_authority ganhou multilaterais (ONU/FMI/BM/UE/Otan/OMC/OCDE) e
      imprensa internacional.
    - Regras novas da vertical: número econômico sempre com fonte e período;
      baixas de guerra sempre atribuídas (lados divergem); percentual de
      referendo/eleição com estágio de apuração; nomes de países/instituições
      em PT-BR; segue proibido IA retratando líder real.
    - Moods visuais (illustrator.py, images.ts, generate.ts) trocados de
      urnas/tribunas para mesa de cúpula/bandeiras/mapa-múndi.

14. **2026-09-02 — Posts manuais escritos pelo gpt-5.6-sol; automático segue
    no gpt-5-mini.** Pedido do Pedro ("modelo melhor na geração individual"),
    que liberou gpt-5.6-terra e gpt-5.6-sol na key. Decidido por A/B real:
    mesmo link (Guardian, acordo EUA-Venezuela), mesma vertical, formato
    padrão, um post por modelo.
    - mini (US$ 0,25/2,00 por Mtok): US$ 0,010/post, 128s (4.886 tokens de
      output — reasoning pesado), texto com repetições ("segundo o Guardian"
      em 4 slides, fatos duplicados), why_it_matters vazio e expressão
      mantida em inglês.
    - terra (US$ 2/12): US$ 0,027/post, 30s, zero AI-tells, caption com
      distinção exemplar fato/alegação, admite o que a fonte não informa.
    - sol (US$ 5/30): US$ 0,070/post, 39s, melhor headline ("Secretário dos
      EUA defende..." — cargo no título, leitor não precisa conhecer o
      sobrenome), leitura mais fina da fonte (notou a ausência de resposta
      venezuelana; "caracterização de críticos, não fato estabelecido").
    Sol venceu: no volume manual (poucos posts/dia, revisados um a um) os
    US$ 0,04 extras por post não importam e a finura poupa "pedir ajustes".
    Implementação: `COMPOSE_MODEL` em `web/src/lib/compose/draft.ts`, default
    `gpt-5.6-sol`, override por env `OPENAI_COMPOSE_MODEL`; vale para gerar
    de link E pedir ajustes. O modelo usado fica gravado no run
    (`final_score_notes: "modelo: ..."`) para rastreabilidade.
    Ideia anotada, não executada: gpt-5.6-luna (US$ 0,20/1,20) é MAIS BARATO
    que o gpt-5-mini e de família mais nova — candidato a substituir o mini
    no pipeline automático depois de um A/B próprio (atenção: benchmark
    aponta luna fraco em long-context).

15. **2026-09-02 — Geração de imagem por IA via API removida; aprovação
    exige imagem em todo slide.** Pedro: "não deu certo e ficou bem ruim".
    Caminhos que ficam: busca no banco (Wikimedia/Openverse, uma foto
    distinta por slide, sem custo) e upload das imagens geradas no ChatGPT
    (skill news-engine-carousel). O botão virou "Buscar fotos no banco" e a
    resposta lista os slides SEM foto ("missing") para completar pelo upload.
    Código removido: generateWithAI/slidePrompt/VERTICAL_MOOD em
    media/generate.ts e a camada 2 inteira de images.ts
    (generateIllustration/buildIllustrationPrompt/imagesForStory, que já
    estava órfã). illustrator.py (caminho Python, desligado por default)
    ficou como está.
    Gate de aprovação: UI desabilita "Aprovar" sem uma imagem POR SLIDE e o
    servidor valida de novo (/api/reviews devolve 409) — aprovado significa
    "pronto para exportar do Prontos". Se o run não estiver na janela do
    histórico, a aprovação passa (guarda de fluxo, não segurança). Validado
    local: 409 sem imagens; busca banco-only 11s, "missing" correto.

16. **2026-09-02 — Pool de candidatas + seletor de imagem por slide.**
    Escolha do Pedro entre 4 desenhos: "pool + score de código + escolha
    manual" (sem juiz de IA — custo/latência/ponto de falha extra para
    decidir o que ele já revisa; plugável depois se o score se mostrar
    insuficiente). Como funciona:
    - Toda imagem obtida (busca no banco OU upload do ChatGPT) vira
      CANDIDATA em `story.media_pool`, arquivo em
      `data/media/<story>/pool/<id>.<ext>` (id do banco = hash da URL:
      buscar de novo não duplica). `slide_media` continua sendo a SELEÇÃO —
      renderer/export/Prontos não conhecem o pool.
    - Score de pré-seleção (0-100, só código): relevância 40% (posição na
      busca; upload = 85 fixo), espaço para texto 35% (nova `bandScore` da
      análise de contraste), nitidez 25% (variância do Laplaciano).
    - Banco: auto-preenche APENAS slides vazios, melhor score primeiro, sem
      repetir foto no post. Upload: entra no pool e preenche vazios NA ORDEM
      enviada (fluxo ChatGPT); slide já escolhido nunca é sobrescrito.
    - Trocar imagem = `POST /api/media/<story>/select` (só JSONs mudam;
      nenhum byte regravado). Thumbs por
      `GET /api/media/<story>/candidate/<id>?w=240` (downscale on the fly,
      ~23KB, cache immutable; caminho SEMPRE resolvido pelo pool — sem path
      traversal).
    - UI: `SlidePicker` no card do post (miniaturas por slide, badge
      banco/gpt + score, tooltip com a decomposição do score).
    - Validado local: banco→pool (7 candidatas, auto-fill 5/5 por score, 7s),
      select persistindo, thumb 23KB, upload sem sobrescrever escolha.
      Post sem foto relevante no banco → 404 com orientação (caso
      FMI/Senegal: título específico demais para Wikimedia/Openverse).

17. **2026-09-02 — Identidade visual GPB aplicada (site + slides).** Pedro
    forneceu o brand board (GPB Media): paleta Ink Black #0A0A0A / Ivory
    #F7F5F1 / Silver Gray #D6DADC / Deep Navy #0F2240 / Royal Blue #1D4ED8;
    Recoleta (display) + Satoshi (texto); sub-brands GPB WORLD /
    ENTERTAINMENT / CURIOSITY — que mapeiam 1:1 nas verticais
    (politics/entertainment/facts). Tagline reduzida a "NEWS." (pedido dele:
    tirar "perspective/impact").
    - **Fontes substitutas** (Recoleta é comercial; Satoshi não está no
      Google Fonts): Fraunces no papel da Recoleta, Plus Jakarta Sans no da
      Satoshi. Se o Pedro comprar a Recoleta um dia, é next/font/local no
      layout + trocar 2 TTFs em web/src/assets/fonts/.
    - Site: tokens novos em globals.css (paper=ivory, brand=royal), Fraunces
      no lockup GPB da sidebar/mobile, Jakarta como sans padrão; verde saiu
      da marca e ficou só como status funcional (--color-ok). Verticais no
      dashboard em tons da paleta (WORLD=royal, ENTERTAINMENT=navy,
      CURIOSITY=slate).
    - Slides: lockup GPB (Fraunces) + sub-brand com pontos royal na capa;
      "GPB WORLD/..." no topo dos internos; manchete da capa em Fraunces
      Black SENTENCE CASE (saiu o caps de Archivo Black); corpo em Jakarta
      (saiu Lora); kicker com barra royal; pílula final royal (saiu o verde);
      acento único #1D4ED8 — a distinção de vertical vem do NOME do
      sub-brand. TTFs antigos removidos; novos são estáticos baixados do
      Google Fonts (satori não lê variable font).
    - Slides antigos re-renderizam no visual novo automaticamente (o render
      é on-the-fly); exports antigos (ZIPs baixados) obviamente não mudam.

18. **2026-09-02 — Detecção de rosto como VETO no posicionamento do texto.**
    Feedback do Pedro sobre caso real: a capa do post do Lionel Richie cobriu
    o rosto dele — a análise de contraste escolhe a faixa mais ESCURA, e num
    palco o rosto está justamente na área escura. Contraste não sabe o que é
    rosto. Solução em código puro (sem API, custo zero): port do runtime do
    picojs (MIT, Nenad Markus) em `web/src/lib/media/faces.ts` + cascata
    oficial `facefinder` (239KB, rostos FRONTAIS) em
    `web/src/assets/models/`. `analyzePlacementSmart` roda contraste +
    detecção; faixa com >20% de rosto recebe penalidade que estoura qualquer
    vantagem de escuridão (o mesmo na coluna, para o alinhamento). Perfil e
    rosto muito pequeno escapam — o fallback é a regra de contraste de
    sempre; nunca lança. Validado no caso real: a mesma foto que era TOP/left
    (texto sobre o rosto) virou BOTTOM/left com o rosto inteiro livre;
    detecção de 7 fotos em ~8s no fluxo de candidatura.
    Ideia anotada, não feita: usar a caixa do rosto também no FRAMING
    (recorte/zoom por slide hoje é fixo e pode cortar rosto na borda).

19. **2026-09-02 — Grid topo/meio/base sob cada slide: override manual do
    posicionamento do texto.** Proposta do Pedro ("continua com as sugestões,
    mas se eu quiser alterar, clico no grid"): a análise automática (contraste
    + veto de rosto) segue sendo a sugestão; a palavra final é um clique na
    revisão. `POST /api/media/<story>/placement` grava o override no
    slide_media do slide E na candidata do pool (a escolha "gruda" na foto:
    re-selecionar a mesma imagem depois preserva o ajuste; trocar para OUTRA
    imagem usa a análise daquela imagem). Só JSONs mudam. UI:
    `PlacementPicker` (▔/▬/▁) sob cada preview de slide com imagem; o preview
    re-renderiza na hora. Validado local: override 200 aplicado nos dois
    lugares, slide sem imagem responde 400 com orientação, 10 pickers no DOM
    com ativo correto. A rota já aceita `align` opcional se um dia o grid
    virar 3x3.

20. **2026-09-02 — Corte por conteúdo (fim do "auto cut" que amputava
    fotos) + fix do latest sobrescrito.** Reclamação do Pedro com print:
    estrela do Walk of Fame e casal cortados ao meio nos slides.
    - Causa 1: FRAMINGS com zoom fixo 1.16-1.42 por posição do carrossel —
      resquício da era "1 imagem por post" (obsoleta). Causa 2: o upload
      cortava no NAVEGADOR (cover 1080x1350 centralizado) — os pixels
      perdidos nem chegavam ao servidor.
    - Fix: a análise (que já decodifica e detecta rostos) agora calcula o
      PONTO FOCAL (rostos → centro ponderado; sem rosto → centroide de
      energia de bordas em grade 6x6) + dimensões reais, gravados na
      candidata e no asset (`focus_x/focus_y/width/height`; espelho no
      models.py). O renderer faz cover exato (zoom 1.0) centrado no foco;
      FRAMINGS vira fallback para assets antigos. `prepareForUpload` só
      REDIMENSIONA (max 1440px, nunca corta) — o recorte 4:5 virou decisão
      única do renderer, guiada pelo foco.
    - Validado no caso do print (post da Dolly, run de ontem): casal inteiro
      no quadro, retrato com rosto enquadrado. Pool antigo sem focus cai no
      fallback (nada quebra).
    - **BUG descoberto e corrigido no caminho:** `runTargets` escrevia
      data/latest.json SEMPRE — editar um post de um run do HISTÓRICO
      sobrescrevia o latest com o run antigo (aconteceu em produção: o
      "hoje" passou a mostrar o run de 01/09 depois que o Pedro trabalhou o
      post da Dolly). Agora o latest só é alvo quando run_id editado ==
      run_id do latest (persist.ts e compose/persistRun.ts); o latest de
      produção foi restaurado para o run de 02/09.

## Pendências / dívidas conhecidas

- [x] ~~Prontos levava ~20s para carregar~~ — 2026-09-02 fase 1: os slides
  renderizados agora têm URL versionada por conteúdo (`?v=` = hash de draft +
  imagem + placement + foco + DESIGN_VERSION em `slides/version.ts`) e a rota
  responde `immutable` — o NAVEGADOR guarda cada slide para sempre
  (sobrevive aos deploys, que zeram o edge da Vercel); só o que muda é
  re-baixado. Fase 2 em andamento: Cloudflare R2 para `data/media/`
  (gravação sem commit, leitura via CDN). Fase 3 anotada: slides
  pré-renderizados no R2 na aprovação (mataria a primeira visita e o export
  de 125s).
- [x] ~~Revisão de mídia "travava" (reclamação do Pedro)~~ — 2026-09-02:
  cada clique (trocar imagem/posição) fazia `router.refresh()`, re-renderizando
  a página inteira e re-buscando TODOS os previews satori (1-3s cada).
  `PostMedia.tsx` unifica previews + seleção + posição com estado local
  otimista: o highlight muda na hora e, confirmado o POST, só o preview do
  slide afetado recarrega (`?v=` cache-buster). Provado no browser: zero
  reload da página, 1 único img re-buscado. SlidePicker/PlacementPicker
  standalone removidos (fundidos). Busca no banco e upload continuam com
  refresh global (mudam pool inteiro; acontecem 1x por post).
- [x] ~~Logo GPB em texto (aproximação)~~ — 2026-09-02: Pedro entregou os
  PNGs oficiais (principal com NEWS + monograma). Processados com Pillow em
  `web/public/brand/`: originais otimizados, variantes ivory p/ foto
  (neutros→ivory, barrinha azul preservada), `gpb-wordmark[-light]` (corte
  automático do bloco NEWS pela linha vazia do alpha) e favicon
  (`web/src/app/icon.png`, servido automático pelo Next). Aplicado: sidebar e
  mobile (principal), capa dos slides (wordmark-light 240px + sub-brand) e
  topo dos internos (wordmark-light 118px + label). O renderer embute o PNG
  como data URL com cache de módulo (mesmo padrão das fontes).
- [x] ~~Prompt do ChatGPT gerava colagem com sombra embutida~~ — corrigido em
  2026-09-02 (briefing.ts + SKILL.md v1.1.0): o prompt PEDIA "um terço do
  quadro escuro", e o gerador pintava vinheta artificial que somava com o
  scrim do renderer; e "gere as 5 imagens" sem proibir grade virava colagem
  2x3. Agora: arquivos SEPARADOS obrigatórios (nunca grade/colagem; uma por
  resposta se preciso), exposição natural SEM escurecimento (o sistema aplica
  o sombreamento depois), e reforço de pessoa-real no briefing (direção que
  cita alguém vira entorno). **Pedro precisa reinstalar a skill no ChatGPT
  (zip 1.1.0)** — o prompt copiável já sai corrigido do dashboard.
- [x] ~~CRON_SECRET nas env vars da Vercel~~ — criada pelo Pedro em
  2026-09-02 e validada (rota autenticou e respondeu "skipped: já existe run
  de hoje"). **Restava o GITHUB_TOKEN sem `Actions: Read and write`** (o
  dispatch de teste voltou 403 nomeado) — Pedro precisa ajustar o token
  fine-grained no GitHub; até lá o gatilho pontual falha e quem entrega é a
  rede de segurança das 11:00 UTC.
- [x] ~~Writer: 2 defeitos do run de 2026-09-02~~ — guards implementados em
  2026-09-02: (1) validador `_headline_completa` no `DraftOutput` (modelo de
  SAÍDA do LLM: roda dentro do retry do `LLMClient.generate` e a mensagem
  volta ao modelo; `EditorialDraft` persistido ficou intocado, então a
  releitura de runs antigos não é afetada) + mesmo guard no `parseDraft` do
  dashboard; (2) regra de fidelidade às fontes em `prompts/humanize.md`
  (cargos/situações atuais NUNCA vêm do conhecimento prévio do modelo).
- [ ] **`CRON_SECRET` ainda não está nas env vars da Vercel** — enquanto não
  estiver, `/api/cron/run` responde 401 e quem entrega o run é a rede de
  segurança do GitHub às 11:00 UTC. Criar em Settings > Environment Variables
  (valor: hex aleatório de 32 bytes), targets production/preview/development.
- [ ] **Confirmar que o `GITHUB_TOKEN` da Vercel tem `Actions: read and
  write`** — ele foi criado para o Contents API (ler runs, commitar reviews).
  Se for fine-grained sem a permissão de Actions, o dispatch volta 403. Teste
  barato: `GET /api/cron/run?force=1` com o Bearer — o guard do workflow
  encerra o run em ~15s, então o teste prova o caminho inteiro sem gastar API.
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

- [x] **"Gerar post" com formato configurável (2026-09-02):** nº de slides
  (3-7), tamanho dos textos por slide (curto/padrão/detalhado), profundidade
  da legenda (curta/padrão/aprofundada), leitor (explicar do zero vs já
  acompanha) e emojis na legenda (override consciente do humanize.md). O
  bloco "FORMATO PEDIDO PELO EDITOR" entra no prompt com prioridade sobre os
  limites padrão; whitelist/clamp na rota; parseDraft valida a contagem
  pedida (o throw aciona a 2ª tentativa). Renderer/export/imagens/briefing já
  eram N-agnósticos (iteram draft.slides). Validado end-to-end com link real:
  4 slides exatos, bodies 10-19 palavras, 3 emojis; legenda veio 156 palavras
  com pedido de 200-260 porque a fonte única era rasa — o modelo parou em vez
  de inventar (comportamento desejado; profundidade real exige mais links).

- **Verticais novas no backlog (pedido do Pedro, 2026-09-02): COMIDA e
  ESPORTES.** Adicionar vertical = 1 bloco em `config/verticals.yaml`
  (id, display_name, description, tone, queries, critérios, guidance,
  extra_rules) + fontes em `sources.yaml` + cor/label em
  `web/src/lib/slides/render.tsx`, `ui.ts`, `briefing.ts` e mood em
  `illustrator.py`/`images.ts`/`generate.ts`. Atenção: MIN/MAX_STORIES_PER_VERTICAL
  multiplica o custo por vertical (~+US$ 0,02-0,03/run cada).
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
