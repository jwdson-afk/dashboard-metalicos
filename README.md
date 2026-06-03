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
| **Motor tributário** (puro, testável) | DAS-MEI, DAS-Simples, monitor de limite, multa/juros, Reforma, calendário, detectores, notas fiscais, classificação PF×PJ e ledger de receita | `packages/tax-engine/` |
| **Fonte da verdade** (`tax_rules`) | Valores 2026 versionados por ano: INSS, ISS, ICMS, limites, anexos I–V, cronograma da Reforma | `packages/tax-engine/data/tax_rules_2026.json` |
| **Backend (API + Agente)** | API REST, tools do Agente (§6.3), loop de tool-calling §6.2, system prompt §6.4 | `apps/api/` |
| **Persistência** | Interface `Repository` (async) com implementações em memória e PostgreSQL | `apps/api/src/repo/` |
| **Jobs + alertas** | Agendador de varredura (§7.4/§9), outbox transacional (§14.2), humanização e canais (WhatsApp) | `apps/api/src/jobs`, `src/alerts` |
| **Notas Fiscais** | Provedor de emissão (stub + Focus NFe) atrás de interface (§10) | `apps/api/src/nf/` |
| **Open Finance** | Provedor bancário (stub + Pluggy), sync que classifica PF×PJ e materializa o ledger (§11) | `apps/api/src/bank`, `src/jobs/sync-bank.ts` |
| **Cobrança + CRM** | Gateway Pix/boleto (stub + Asaas), régua de cobrança (dunning) com eventos no outbox (§12) | `apps/api/src/billing`, `src/jobs/dunning.ts` |
| **Decisão de regime 2027** | Wizard que recomenda manter MEI / migrar ME / Simples comum × híbrido (§13.2) | `packages/tax-engine/src/regime-advisor.ts` |
| **Automação progressiva** | Nível de autonomia por ação (manual/assisted/autonomous): prevê × executa (§6.5) | `apps/api/src/automation.ts` |
| **Schema do banco** | Tabelas da spec §5 + outbox/emissão (§14.2) | `db/migrations/` |
| **Seed SQL** | Gerado do JSON canônico (sem divergência) | `db/seeds/tax_rules_2026.sql` |
| **Dashboard** | Visão geral, limite, DAS, cobrança, Reforma/wizard e chat — offline ou conectado à API | `index.html` |

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

npm run check               # typecheck + guard anti-hardcode + testes (96 casos)
npm test                    # testes do tax-engine + da API
npm run seed:gen            # regenera db/seeds/tax_rules_2026.sql do JSON canônico
npm run api:dev             # sobe a API em http://localhost:3001 (+ agendador)
```

O dashboard é um único `index.html` autocontido — abra direto no navegador
(ou sirva com `python3 -m http.server`). Por padrão roda **offline** com dados de
demonstração; clique em **"Conectar API"** (ou abra com `?api=http://localhost:3001`)
para hidratar os painéis com dados reais do backend — KPIs, monitor de limite,
obrigações, alertas dos detectores, cobranças, wizard de regime e chat do Agente.
A API habilita CORS (`CORS_ORIGIN` para restringir em produção).

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
| `POST` | `/jobs/run-cycle` | Roda um ciclo do agendador: varredura + despacho de alertas |
| `POST` | `/jobs/dispatch` | Despacha só o outbox pendente |
| `POST` | `/jobs/bank-sync` | Sincroniza Open Finance: extrato → classificação PF×PJ → ledger → eventos |
| `POST` | `/jobs/dunning` | Roda a régua de cobrança: avança etapas e emite eventos |
| `GET` | `/companies/:id/ledger` | Ledger de receita materializado (janela móvel 12m) |
| `GET` | `/companies/:id/charges?status=` | Cobranças da empresa |
| `GET` | `/companies/:id/regime-advice` | Wizard de decisão de regime 2027 (§13.2) |
| `GET`/`PUT` | `/companies/:id/automation` | Lê/ajusta os níveis de autonomia por ação (§6.5) |

As tools incluem cálculo (`calculate_das_mei`, `check_limit_projection`,
`explain_reform_impact`…), **notas fiscais** (`validate_invoice`, `issue_invoice`, §10)
**financeiro** (`get_cashflow`, `classify_transaction`, §11) **cobrança/CRM** (`create_charge`, `list_charges`, `list_customers`, §12) e
**estratégia** (`recommend_regime`, `get_automation`, `set_automation`, §13.2/§6.5)
— todas acessíveis via `POST /companies/:id/tools/:tool`.

As AÇÕES (`issue_invoice`, `create_charge`, `generate_das_guia`) respeitam a
**automação progressiva**: em modo `assisted` (default) o Agente apenas *prevê* o
resultado (sem efeito colateral) e pede confirmação; com `confirm: true` ou em
modo `autonomous`, executa. Decisões de alto risco fiscal nunca saem do humano.

#### Persistência, outbox e alertas

A persistência é abstraída por uma interface `Repository` (assíncrona). Sem
`DATABASE_URL`, usa **memória** (dev/demos/testes); com `DATABASE_URL`, ativa o
**PostgreSQL** (`apps/api/src/repo/postgres.ts`, schema em `db/migrations/`).

O **agendador** (`apps/api/src/jobs/`) roda em intervalo (`SCAN_INTERVAL_MS`,
default 1h) uma varredura que: (1) gera as obrigações do calendário fiscal de
forma idempotente (§7.4) e (2) roda os detectores e grava os eventos no **outbox
transacional** com deduplicação (§14.2). O **despachante** (`apps/api/src/alerts/`)
lê o outbox, humaniza cada evento em PT-BR e entrega pelos **canais** ativos
(console por padrão; WhatsApp via `WHATSAPP_TOKEN`+`WHATSAPP_PHONE_ID`). Entrega
*at-least-once*: o evento só é marcado como publicado após o envio.

A emissão de NF passa por um **provedor** (`apps/api/src/nf/`): stub determinístico
por padrão, ou Focus NFe via `NF_PROVIDER=focus`+`FOCUS_NFE_TOKEN`.

O **Open Finance** (`apps/api/src/bank/`, `src/jobs/sync-bank.ts`) busca o extrato
(stub ou Pluggy), **classifica cada transação PF×PJ** (`packages/tax-engine/src/classify.ts`),
persiste de forma idempotente, **materializa o `revenue_ledger`** (janela móvel 12m)
e emite no outbox o evento de **mistura PF/PJ** — a "separação sagrada" do produto.

A **cobrança** (`apps/api/src/billing/`, `src/jobs/dunning.ts`) cria Pix/boleto via
gateway (stub ou Asaas via `PAYMENT_GATEWAY=asaas`+`ASAAS_API_KEY`) e roda a **régua
de cobrança** (`packages/tax-engine/src/dunning.ts`): lembrete D-3 e escalonamento
após o vencimento, cada degrau disparando um evento único (dedupe por etapa).

| Variável | Efeito |
|---|---|
| `ANTHROPIC_API_KEY` | habilita o Agente IA (sem ela, `503`) |
| `COPILOTO_AGENT_MODEL` | modelo do Agente (default Sonnet 4.6) |
| `DATABASE_URL` | ativa o PostgreSQL no lugar da memória |
| `NF_PROVIDER=focus` + `FOCUS_NFE_TOKEN` | emissor de NF real |
| `BANK_PROVIDER=pluggy` + `PLUGGY_CLIENT_ID`/`SECRET` | Open Finance via Pluggy |
| `PAYMENT_GATEWAY=asaas` + `ASAAS_API_KEY` | cobrança Pix/boleto via Asaas |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | canal de alerta no WhatsApp |
| `SCHEDULER_ENABLED=false` | não inicia o agendador no boot |
| `SCAN_INTERVAL_MS` | intervalo do agendador (ms) |

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
├── apps/api/                        # backend Fastify (API + Agente IA + jobs)
│   ├── src/repo/                    #   Repository (interface) · memory · postgres
│   ├── src/tools/                   #   tools do Agente (§6.3) + implementações
│   ├── src/agent/                   #   system prompt §6.4 + loop de tool-calling §6.2
│   ├── src/jobs/                    #   varredura · agendador · sync-bank · dunning
│   ├── src/alerts/                  #   outbox dispatcher · humanize · canais (§9.3/§14.2)
│   ├── src/nf/                      #   provedor de NF (stub · Focus NFe)
│   ├── src/bank/                    #   provedor Open Finance (stub · Pluggy) (§11)
│   ├── src/billing/                 #   gateway de pagamento (stub · Asaas) (§12)
│   ├── src/server.ts                #   rotas REST
│   └── test/                        #   testes de tools, prompt e pipeline (sem rede)
├── packages/tax-engine/             # motor tributário puro (TypeScript)
│   ├── src/                         #   das-mei · das-simples · limits · penalty · reform
│   │                                #   · calendar · detectors · nota-fiscal · classify
│   │                                #   · ledger · dunning · regime-advisor · tax-rules
│   ├── data/tax_rules_2026.json     #   fonte da verdade (versionada)
│   ├── test/                        #   casos de aceite (node:test + tsx)
│   └── scripts/check-no-hardcode.mjs
└── db/
    ├── migrations/001_init.sql      # schema completo (spec §5)
    ├── migrations/002_outbox.sql    # outbox transacional + log de emissão (§14.2)
    ├── migrations/003_open_finance.sql # idempotência da sincronização bancária (§11)
    ├── migrations/004_automation.sql # níveis de autonomia por ação (§6.5)
    └── seeds/                       # seed de tax_rules (gerado)
```

---

## Próximas fases (roadmap spec §18)

- **Fase 1** — ✅ calendário fiscal + detectores, ✅ Agente IA (system prompt §6.4 +
  tools + loop §6.2), ✅ persistência (interface + Postgres), ✅ job agendado +
  outbox transacional, ✅ canais de alerta (console + WhatsApp estrutural).
- **Fase 2** — ✅ módulo de Notas Fiscais (§10): roteamento NFS-e/NF-e, validação,
  retenção de ISS, campos da Reforma, tools `validate_invoice`/`issue_invoice`,
  ✅ provedor de emissão (stub + Focus NFe). Falta: `revenue_ledger`.
- **Fase 3** — ✅ Open Finance (provedor stub + Pluggy estrutural), ✅ classificação
  PF×PJ + detector de mistura, ✅ ledger de receita (janela móvel), ✅ fluxo de caixa.
- **Fase 4** — ✅ Cobrança Pix/boleto (gateway stub + Asaas), ✅ régua de cobrança
  (dunning) com eventos no outbox, ✅ CRM (clientes + cobranças).
- **Fase 5** — ✅ Wizard de decisão de regime 2027 (manter MEI / migrar ME / Simples
  comum × híbrido) + detector do prazo de opção, ✅ automação progressiva (níveis
  de autonomia por ação: prevê × executa).

> Todas as fases do roadmap §18 têm seu núcleo implementado e testado. O que
> permanece para produção real são integrações externas (ativar os adaptadores
> Postgres/Focus/Pluggy/Asaas/WhatsApp via env) e o frontend completo — a lógica
> de negócio, os jobs e o Agente já estão prontos e cobertos por testes.

> Aviso: o produto orienta e automatiza, mas decisões de alto risco fiscal
> (enquadramento, regime 2027) exigem validação contábil — conforme a spec.
