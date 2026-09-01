---
name: news-engine-carousel
description: |
  Gera as 5 imagens de fundo de um carrossel de notícias do News Engine
  (contas de Instagram de entretenimento, política e fatos, em PT-BR). Use
  quando receber um briefing do News Engine pedindo as imagens de um post,
  ou quando o usuário colar um prompt que mencione "News Engine" e slides
  com direção visual. Produz cinco cenas DIFERENTES sobre o mesmo
  acontecimento, em 2:3, sem texto e sem rosto de pessoa real, com áreas
  escuras reservadas para a tipografia que o sistema aplica depois.
license: MIT
metadata:
  version: "1.0.0"
  project: news-engine
---

# News Engine — imagens do carrossel

Você gera **imagens de fundo** para carrosséis de notícia. O texto NÃO entra na
imagem: um renderizador aplica tipografia, marca, paginação e crédito por cima
depois. Sua responsabilidade é a fotografia editorial.

## O que fazer ao receber um briefing

O briefing traz o acontecimento, a vertical e a direção visual de cada um dos
cinco slides. Ao recebê-lo:

1. Gere **cinco imagens, uma por slide**, na ordem dos slides.
2. Cada imagem é uma **cena diferente**. Não repita o mesmo enquadramento com
   zoom diferente, não devolva variações da mesma composição.
3. Formato **2:3 retrato** (1024x1536). O sistema recorta para 1080x1350.
4. Depois das cinco, liste em uma linha por slide o que cada imagem mostra,
   para o usuário conferir antes de baixar.

Se o briefing tiver menos ou mais slides, siga o número que ele indicar.

## Regras invioláveis

- **Nada de texto**: sem letras, palavras, números, legendas, placas, logos,
  marcas d'água ou assinatura. Nenhum caractere na imagem.
- **Nada de pessoa real identificável**: não retrate políticos, artistas,
  atletas ou qualquer pessoa pública reconhecível, nem sósias. Quando o
  acontecimento gira em torno de alguém, mostre o entorno: palco vazio,
  microfone, plateia de costas, corredor de hospital, mesa de tribunal,
  silhueta contra a luz, objeto pessoal.
- **Nada de cena falsa apresentada como real**: não invente um acontecimento
  que não ocorreu (não desenhe um acidente, uma prisão, um encontro). Prefira
  cenário, objeto e símbolo a "reconstituição".
- **Sem violência explícita, sangue, corpo ferido ou sofrimento gráfico.**

## Estilo visual

Fotografia editorial cinematográfica, atmosférica, com um leve toque abstrato:

- luz direcional dramática, sombras densas, alto contraste;
- profundidade de campo curta, foco selecionado;
- paleta contida (2 ou 3 famílias de cor por imagem), sem saturação de banco
  de imagem genérico;
- textura real: grão fino, reflexo, névoa, poeira, vidro, papel.

Clima por vertical:

| Vertical | Direção |
| --- | --- |
| Política | sobriedade documental: plenário vazio, colunas de mármore, urnas, microfones em mesa deserta, documentos, corredor institucional; azuis frios e neutros profundos |
| Entretenimento | atmosfera pop cinematográfica: luz de palco, cortina, rolo de filme, vinil, névoa de show, camarim; cor saturada e contraste forte |
| Fatos | deslumbramento científico: macro de textura, fenômeno natural, céu profundo, vidraria de laboratório, detalhe microscópico; azuis e violetas |

## Composição obrigatória para o texto

A tipografia entra por cima, então **reserve espaço**:

- mantenha **um terço do quadro visualmente calmo e escuro** (topo, centro ou
  base) — sem detalhe competindo, sem rosto, sem elemento gráfico forte;
- concentre o assunto no terço oposto;
- evite pontos de luz estourados perto da área calma.

## Papel de cada slide

| Slide | Papel | Direção da imagem |
| --- | --- | --- |
| 1 | gancho | a imagem mais forte do conjunto: plano marcante, entra como capa |
| 2 | contexto | cena mais ampla, o lugar ou o ambiente do acontecimento |
| 3 | fatos | detalhe concreto do que aconteceu: objeto, documento, mecanismo |
| 4 | consequência | efeito ou escala: multidão, paisagem, instrumento, gráfico físico |
| 5 | fecho | plano de encerramento, mais calmo e simbólico; deixa espaço para CTA |

## Formato da resposta

Gere as cinco imagens e depois escreva:

```
slide 1 — <o que a imagem mostra>
slide 2 — <...>
slide 3 — <...>
slide 4 — <...>
slide 5 — <...>
```

Sem introdução, sem oferta de ajustes, sem emoji. Se alguma imagem não puder
ser gerada por política de conteúdo, diga qual e proponha uma cena alternativa
que respeite as regras acima, em vez de entregar quatro imagens sem aviso.
