import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArticle, publicAddress, resolveGoogleArticle } from "../src/lib/compose/article";
import { composeFromNews } from "../src/lib/compose/fromNews";
import { buildImagePrompt } from "../src/lib/media/prompt";

const body = "O partido recebeu 43,8% dos votos na Saxônia-Anhalt, segundo resultados provisórios. A eleição estadual não garante maioria para formar o governo. ".repeat(12);
test("extracts actual article body and retains publisher identity", () => {
  const html = `<html><head><title>Resultado na Saxônia-Anhalt</title><script type="application/ld+json">${JSON.stringify({"@type":"NewsArticle", articleBody:body})}</script></head><body><nav>Menu Cookies</nav><article><p>${body}</p></article></body></html>`;
  const article = parseArticle(html, "https://publisher.example/politica/eleicao");
  assert.match(article.excerpt, /43,8%/);
  assert.match(article.excerpt, /Saxônia-Anhalt/);
  assert.equal(article.domain, "publisher.example");
  assert.equal(article.url, "https://publisher.example/politica/eleicao");
  assert.doesNotMatch(article.excerpt, /Menu Cookies/);
});
test("rejects Google metadata and short publisher summaries", () => {
  assert.throws(() => parseArticle(`<title>Google News</title><p>${body}</p>`, "https://news.google.com/articles/abc"), /matéria não lida/);
  assert.throws(() => parseArticle('<title>Notícia</title><meta name="description" content="Um resumo curto"><p>Assine para ler.</p>', "https://publisher.example/news"), /insuficiente|estrutura/);
});
test("blocks draft generation before LLM when no real sources were read", async () => {
  await assert.rejects(composeFromNews({id:"fixture"} as never, {id:"gn-123",section:"world",outlets:[]} as never, []), /geração bloqueada/);
});
test("disallows private network and loopback addresses", () => {
  for (const address of ["127.0.0.1","10.0.0.5","192.168.1.2","169.254.169.254","172.16.1.1","100.64.0.1","::1","::ffff:127.0.0.1","fd00::1"]) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("198.41.200.1"), true);
});
test("decodes Google RPC into a publisher URL and does not accept generic metadata", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    if (calls === 1) return new Response('<div data-n-a-sg="signature" data-n-a-ts="1234"></div>');
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /Fbv4je/);
    return new Response(")]}'\n\n" + JSON.stringify([["wrb.fr","Fbv4je",JSON.stringify(["garturlres","https://publisher.example/story"])]]));
  };
  try { assert.equal(await resolveGoogleArticle("https://news.google.com/rss/articles/CBMi123", AbortSignal.timeout(5000)), "https://publisher.example/story"); }
  finally { globalThis.fetch = previous; }
});
test("each image request contains shared carousel context and targets one slide", () => {
  const prompt = buildImagePrompt({title:"Notícia",vertical:"world",instagramHeadline:"Uma notícia",shortSummary:"Resumo",isRumorOrClaim:false,slideNumber:2,slideCount:5,role:"CONTEXT",headline:"Contexto",body:"Texto",imageDirection:"Cena",custom:"",carouselContext:"Slide 1: mapa. Slide 2: urna. Slide 3: parlamento."});
  assert.match(prompt, /Slide 1: mapa/);
  assert.match(prompt, /SOMENTE o fundo do slide 2/);
  assert.match(prompt, /Não gere texto/);
});
