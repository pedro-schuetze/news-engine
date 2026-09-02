# News Engine — instruções para Claude Code

Leia `docs/CONTEXT.md` antes de qualquer mudança relevante — é a memória viva
do projeto (estado, decisões com porquês, pendências, próximos passos) e deve
ser ATUALIZADA ao final de cada sessão que mude algo significativo.

## Comandos

```bash
.venv\Scripts\python -m pytest              # testes (mock, zero custo de API)
.venv\Scripts\python -m src.pipeline --mock # run simulado end-to-end
.venv\Scripts\python -m src.pipeline        # run real (exige key no .env)
cd web && npm run dev                       # dashboard em http://localhost:3000
```

## Regras do projeto

- Nunca commitar `.env` nem keys; segredos do CI vivem em GitHub Secrets.
- Testes nunca gastam créditos de API (usar MockProvider/fixtures).
- Texto editorial gerado é sempre PT-BR; tom por vertical em `config/verticals.yaml`.
- Comportamento editorial muda em `config/*.yaml`, não em código, sempre que possível.
- Fórmulas de score são explícitas e testadas (`src/processing/ranking.py`);
  o LLM nunca decide ranking sozinho.
- Rodar `pytest` antes de commitar mudanças no pipeline.
- POLITICS (vertical **Mundo**: política e economia internacionais desde 2026-09-02; o id interno segue `politics`) tem regras mais duras (verificação/atribuição) — não flexibilizar sem o Pedro.
