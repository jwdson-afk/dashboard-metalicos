# Copiloto MEI & ME

Plataforma SaaS de **gestão fiscal, financeira e operacional autônoma** para
microempreendedores (MEI) e microempresas (ME/EPP) brasileiras. Um copiloto que
monitora a empresa 24/7, detecta problemas antes de virarem crises e executa a
burocracia em linguagem humana.

> Implementação a partir da especificação técnica `spec_copiloto_mei_me`.
> Documento mestre = fonte única da verdade.

---

## O que já está implementado nesta fase

Esta é a **fundação** do produto: o núcleo tributário testável, o schema de dados,
a configuração versionada de regras e um dashboard de demonstração.

| Camada | Entrega | Onde |
|---|---|---|
| **Motor tributário** (puro, testável) | DAS-MEI, DAS-Simples Nacional, monitor de limite, multa/juros, Reforma, calendário fiscal, detectores e notas fiscais | `packages/tax-engine/` |
| **Fonte da verdade** (`tax_rules`) | Valores 2026 versionados por ano: INSS, ISS, ICMS, limites, anexos I–V, cronograma da Reforma | `packages/tax-engine/data/tax_rules_2026.json` |
| **Backend (API + Agente)** | API REST, calendário fiscal, detectores, tools do Agente (§6.3) e loop de tool-calling com system prompt §6.4 | `apps/api/` |
| **Schema do banco** | Todas as tabelas da spec §5 (identidade, financeiro, fiscal, notas, cobrança, eventos, auditoria) | `db/migrations/001_init.sql` |
| **Seed SQL** | Gerado do JSON canônico (sem divergência) | `db/seeds/tax_rules_2026.sql` |
| **Dashboard** | Visão geral, monitor de limite, calculadora DAS, Reforma e chat do Copiloto | `index.html` |

### Princípio inegociável: nada hardcoded

Nenhum valor tributário (alíquota, prazo, limite) vive no código de cálculo —
tudo resolve via `tax_rules`, versionado por ano (spec §1.3.6, §19, §20).
Um guard de CI (`lint:no-hardcode`) **falha** se encontrar um valor fiscal literal
nos arquivos de cálculo. Todo cálculo expõe `rule_version` (quais regras foram
usadas) para gravação no `audit_log` — defensibilidade legal.

---

## Rodando

```bash
npm install                 # instala todos os workspaces

npm run check               # typecheck + guard anti-hardcode + testes (52 casos)
npm test                    # testes do tax-engine + da API
npm run seed:gen            # regenera db/seeds/tax_rules_2026.sql do JSON canônico
npm run api:dev             # sobe a API em http://localhost:3001
```

O dashboard é um único `index.html` autocontido — abra direto no navegador
(ou sirva com `python3 -m http.server`).

### API (apps/api)

Backend Fastify que expõe o tax-engine, o calendário e os detectores, além do Agente IA.

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/companies/:id/status` | Situação consolidada (regime, % do teto, próximo vencimento) |
| `GET` | `/companies/:id/obligations?status=` | Obrigações fiscais |
| `GET` | `/companies/:id/calendar` | Obrigações que o calendário geraria hoje (§7.4) |
| `GET` | `/companies/:id/detectors` | Eventos disparados pelos detectores agora (§9) |
| `GET` | `/companies/:id/agent/prompt` | System prompt §6.4 renderizado + catálogo de tools |
| `POST` | `/companies/:id/agent/message` | Conversa com o Agente (requer `ANTHROPIC_API_KEY`) |
| `POST` | `/companies/:id/tools/:tool` | Executa uma tool diretamente (ações confirmadas) |

As tools incluem cálculo (`calculate_das_mei`, `check_limit_projection`,
`explain_reform_impact`…) e **notas fiscais** (`validate_invoice` e a ação
`issue_invoice`, §10) — todas acessíveis via `POST /companies/:id/tools/:tool`.

O **Agente** (`apps/api/src/agent/`) roda o loop de tool-calling da spec §6.2 com
prompt caching. Sem `ANTHROPIC_API_KEY` ele fica indisponível e a rota responde
`503` — coerente com o princípio "nunca inventa". As tools de cálculo delegam 100%
ao `@copiloto/tax-engine`. Configure o modelo via `COPILOTO_AGENT_MODEL`.

### Casos de aceite cobertos (spec §19)

- DAS-MEI serviços `R$ 86,05` · comércio `R$ 82,05` · misto `R$ 87,05` · caminhoneiro
- Limite proporcional no ano de abertura (`teto/12 × meses ativos`)
- Receita 12m por janela móvel
- Alíquota efetiva do Simples pela fórmula oficial
- Multa por atraso com teto de 20% + juros Selic
- Detector de limite 80% / 95% / overflow
- Agente "sem dado" → `RuleNotFoundError` (nunca inventa)

---

## Estrutura

```
.
├── index.html                       # dashboard (demo offline)
├── apps/api/                        # backend Fastify (API + Agente IA)
│   ├── src/repo/                    #   repositório em memória (trocável por Postgres)
│   ├── src/tools/                   #   tools do Agente (§6.3) + implementações
│   ├── src/agent/                   #   system prompt §6.4 + loop de tool-calling §6.2
│   ├── src/server.ts                #   rotas REST
│   └── test/                        #   testes de tools e prompt (sem rede)
├── packages/tax-engine/             # motor tributário puro (TypeScript)
│   ├── src/                         #   das-mei · das-simples · limits · penalty · reform
│   │                                #   · calendar · detectors · nota-fiscal · tax-rules
│   ├── data/tax_rules_2026.json     #   fonte da verdade (versionada)
│   ├── test/                        #   casos de aceite (node:test + tsx)
│   └── scripts/check-no-hardcode.mjs
└── db/
    ├── migrations/001_init.sql      # schema completo (spec §5)
    └── seeds/                       # seed de tax_rules (gerado)
```

---

## Próximas fases (roadmap spec §18)

- **Fase 1** — ✅ calendário fiscal + detectores, ✅ Agente IA (system prompt §6.4 +
  tools + loop §6.2). Falta: persistência real (Postgres), job agendado, canais de alerta.
- **Fase 2** — ✅ módulo de Notas Fiscais (§10): roteamento NFS-e/NF-e, validação,
  retenção de ISS, campos da Reforma, tools `validate_invoice`/`issue_invoice`.
  Falta: integração com emissor real (PlugNotas/Focus) e `revenue_ledger`.
- **Fase 3** — Open Finance (Pluggy) + classificação PF×PJ, fluxo de caixa, DAS-Simples.
- **Fase 4** — Cobrança Pix/boleto + régua + CRM.
- **Fase 5** — Wizard de decisão de regime 2027, automação progressiva.

> Aviso: o produto orienta e automatiza, mas decisões de alto risco fiscal
> (enquadramento, regime 2027) exigem validação contábil — conforme a spec.
