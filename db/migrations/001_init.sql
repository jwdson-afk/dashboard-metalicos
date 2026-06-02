-- Copiloto MEI & ME — schema inicial (spec §5).
-- Schema normalizado. Toda tabela: id UUID, created_at, updated_at.
-- Monetário em numeric(14,2). Soft-delete (deleted_at) onde há dado fiscal (retenção 5 anos).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================ §5.1 Identidade e empresa
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,                              -- E.164, WhatsApp/SMS
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  cpf           TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active',    -- active|suspended|deleted
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID NOT NULL REFERENCES users(id),
  legal_name          TEXT NOT NULL,               -- razão social
  trade_name          TEXT,                        -- nome fantasia
  cnpj                TEXT UNIQUE NOT NULL,
  regime              TEXT NOT NULL,               -- mei|simples_me|simples_epp|nanoempr
  cnae_principal      TEXT NOT NULL,
  cnae_secundarios    TEXT[],
  activity_type       TEXT NOT NULL,               -- comercio|industria|servicos|misto|caminhoneiro
  simples_anexo       TEXT,                        -- I|II|III|IV|V (null para MEI)
  opening_date        DATE NOT NULL,               -- afeta limite proporcional
  municipality_ibge   TEXT NOT NULL,
  state_uf            CHAR(2) NOT NULL,
  is_iss_contributor  BOOLEAN NOT NULL DEFAULT false,
  is_icms_contributor BOOLEAN NOT NULL DEFAULT false,
  reform_option_2027  TEXT,                        -- simples_puro|simples_hibrido|regime_regular
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE company_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,                        -- owner|partner|accountant|viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  plan               TEXT NOT NULL,                -- free|mei_pro|me_essencial|me_plus
  status             TEXT NOT NULL,                -- trialing|active|past_due|canceled
  price_cents        INTEGER NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  gateway_ref        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================ §5.2 tax_rules (fonte da verdade)
CREATE TABLE tax_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key      TEXT NOT NULL,                     -- ex: 'mei.das.inss', 'mei.limite_anual'
  year_valid    INTEGER NOT NULL,
  valid_from    DATE NOT NULL,
  valid_until   DATE,
  value_numeric NUMERIC(14,4),
  value_text    TEXT,
  metadata      JSONB,                             -- faixas, cronograma, deduções
  source_url    TEXT,                              -- fonte oficial (rastreabilidade)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_key, year_valid)
);

-- ============================================================ §5.3 Financeiro
CREATE TABLE bank_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  owner_type   TEXT NOT NULL,                      -- pj|pf (CRÍTICO para separação)
  institution  TEXT NOT NULL,
  account_label TEXT,
  provider_ref TEXT,                               -- id no agregador (Pluggy/Belvo)
  last_sync_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),        -- null = categoria global do sistema
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,                        -- revenue|cost|expense|tax|personal
  parent_id  UUID REFERENCES categories(id)
);

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  bank_account_id   UUID REFERENCES bank_accounts(id),
  direction         TEXT NOT NULL,                 -- inflow|outflow
  amount            NUMERIC(14,2) NOT NULL,
  occurred_at       DATE NOT NULL,
  description       TEXT,
  category_id       UUID REFERENCES categories(id),
  classification    TEXT NOT NULL DEFAULT 'unclassified', -- pj_revenue|pj_expense|pf_*|tax_payment
  counts_as_revenue BOOLEAN NOT NULL DEFAULT false,-- entra no cálculo do teto?
  pf_pj_flag        TEXT NOT NULL DEFAULT 'unknown',-- pj|pf|mixed_alert|unknown
  is_anomaly        BOOLEAN NOT NULL DEFAULT false,
  source            TEXT NOT NULL,                 -- open_finance|manual|invoice|pix
  external_ref      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_company_date ON transactions(company_id, occurred_at);
CREATE INDEX idx_tx_revenue ON transactions(company_id, counts_as_revenue, occurred_at);

CREATE TABLE revenue_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  ref_year        INTEGER NOT NULL,
  ref_month       INTEGER NOT NULL,
  revenue_month   NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_ytd     NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_12m     NUMERIC(14,2) NOT NULL DEFAULT 0,-- janela móvel (regra real)
  limit_reference NUMERIC(14,2) NOT NULL,          -- teto aplicável
  usage_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ref_year, ref_month)
);

-- ============================================================ §5.4 Fiscal e obrigações
CREATE TABLE tax_obligations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  kind           TEXT NOT NULL,                    -- das_mei|das_simples|dasn|defis|dirpf|nf_pending
  ref_period     TEXT NOT NULL,                    -- '2026-03' ou '2026'
  due_date       DATE NOT NULL,
  amount         NUMERIC(14,2),
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|generated|paid|overdue
  guia_url       TEXT,
  barcode        TEXT,
  pix_copia_cola TEXT,
  paid_at        TIMESTAMPTZ,
  penalty_amount NUMERIC(14,2) DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, ref_period)
);
CREATE INDEX idx_oblig_due ON tax_obligations(company_id, status, due_date);

CREATE TABLE simples_calculations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  ref_period     TEXT NOT NULL,
  rbt12          NUMERIC(14,2) NOT NULL,
  anexo          TEXT NOT NULL,
  faixa          INTEGER NOT NULL,
  nominal_rate   NUMERIC(7,4) NOT NULL,
  deduction      NUMERIC(14,2) NOT NULL,
  effective_rate NUMERIC(7,4) NOT NULL,
  revenue_month  NUMERIC(14,2) NOT NULL,
  das_value      NUMERIC(14,2) NOT NULL,
  breakdown      JSONB,                            -- repartição por tributo (inclui IBS/CBS)
  calculated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ref_period)
);

-- ============================================================ §5.5 Notas fiscais
CREATE TABLE customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  name             TEXT NOT NULL,
  doc              TEXT,                            -- CPF/CNPJ
  is_pj            BOOLEAN NOT NULL DEFAULT false,
  email            TEXT,
  phone            TEXT,
  notes            TEXT,
  last_purchase_at DATE,
  total_purchased  NUMERIC(14,2) DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  model             TEXT NOT NULL,                 -- nfe|nfce|nfse
  number            TEXT,
  series            TEXT,
  customer_id       UUID REFERENCES customers(id),
  customer_doc      TEXT,
  customer_is_pj    BOOLEAN NOT NULL,
  issue_date        DATE NOT NULL,
  total_amount      NUMERIC(14,2) NOT NULL,
  items             JSONB NOT NULL,                -- [{desc, qty, unit_price, cfop, ncm, cst_csosn}]
  crt               TEXT NOT NULL DEFAULT '4',     -- MEI = CRT 4
  ibs_value         NUMERIC(14,2) DEFAULT 0,       -- campos da Reforma (2026+)
  cbs_value         NUMERIC(14,2) DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft', -- draft|issued|authorized|rejected
  authorization_key TEXT,                          -- chave de acesso (44 dígitos)
  xml_url           TEXT,
  pdf_danfe_url     TEXT,
  rejection_reason  TEXT,
  provider_ref      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_company ON invoices(company_id, issue_date);

-- ============================================================ §5.6 Cobrança, CRM
CREATE TABLE charges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  customer_id    UUID REFERENCES customers(id),
  amount         NUMERIC(14,2) NOT NULL,
  method         TEXT NOT NULL,                    -- pix|boleto
  due_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',     -- open|paid|overdue|canceled
  pix_copia_cola TEXT,
  boleto_url     TEXT,
  paid_at        TIMESTAMPTZ,
  dunning_step   INTEGER NOT NULL DEFAULT 0,       -- etapa da régua
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================ §5.7 Inteligência, eventos, auditoria
CREATE TABLE domain_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  event_type TEXT NOT NULL,                        -- catálogo §14.1
  payload    JSONB NOT NULL,
  processed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_unprocessed ON domain_events(processed, created_at);

CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  severity       TEXT NOT NULL,                    -- info|warning|critical
  category       TEXT NOT NULL,                    -- fiscal|financial|limit|reform|compliance|cashflow
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,                    -- mensagem humanizada do agente
  action_type    TEXT,                             -- generate_das|simulate_migration|emit_invoice
  action_payload JSONB,
  status         TEXT NOT NULL DEFAULT 'unread',   -- unread|read|actioned|dismissed
  channel_sent   TEXT[],                           -- ['push','whatsapp','email']
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id),
  role            TEXT NOT NULL,                   -- user|assistant|tool
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  actor         TEXT NOT NULL,                     -- system|agent|user:<id>
  action        TEXT NOT NULL,                     -- tax.calculated|das.generated|invoice.issued
  entity_type   TEXT,
  entity_id     UUID,
  before_state  JSONB,
  after_state   JSONB,
  rule_version  JSONB,                             -- quais tax_rules foram usadas (defensibilidade)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
