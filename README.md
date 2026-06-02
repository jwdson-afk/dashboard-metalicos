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
| **Motor tributário** (puro, testável) | DAS-MEI, DAS-Simples Nacional, monitor de limite, multa/juros, Reforma | `packages/tax-engine/` |
| **Fonte da verdade** (`tax_rules`) | Valores 2026 versionados por ano: INSS, ISS, ICMS, limites, anexos I–V, cronograma da Reforma | `packages/tax-engine/data/tax_rules_2026.json` |
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
npm install                 # instala workspaces

npm run check               # typecheck + guard anti-hardcode + testes
npm test                    # só os testes do tax-engine (23 casos)
npm run seed:gen            # regenera db/seeds/tax_rules_2026.sql do JSON canônico
```

O dashboard é um único `index.html` autocontido — abra direto no navegador
(ou sirva com `python3 -m http.server`).

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
├── packages/tax-engine/             # motor tributário puro (TypeScript)
│   ├── src/                         #   das-mei · das-simples · limits · penalty · reform · tax-rules
│   ├── data/tax_rules_2026.json     #   fonte da verdade (versionada)
│   ├── test/                        #   casos de aceite (node:test + tsx)
│   └── scripts/check-no-hardcode.mjs
└── db/
    ├── migrations/001_init.sql      # schema completo (spec §5)
    └── seeds/                       # seed de tax_rules (gerado)
```

---

## Próximas fases (roadmap spec §18)

- **Fase 1** — Geração automática de obrigações (calendário fiscal), Agente IA com
  system prompt §6.4 + tools, dashboard + chat reais.
- **Fase 2** — Emissor de NF (PlugNotas/Focus), `revenue_ledger`, `simulate_migration`.
- **Fase 3** — Open Finance (Pluggy) + classificação PF×PJ, fluxo de caixa, DAS-Simples.
- **Fase 4** — Cobrança Pix/boleto + régua + CRM.
- **Fase 5** — Wizard de decisão de regime 2027, automação progressiva.

> Aviso: o produto orienta e automatiza, mas decisões de alto risco fiscal
> (enquadramento, regime 2027) exigem validação contábil — conforme a spec.
