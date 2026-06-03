-- ============================================================
-- Migration 002 — Outbox transacional de eventos (spec §14.2) e
-- log de emissão de notas do fluxo MVP.
--
-- Estende `domain_events` (criada em 001) com os campos que o despachante
-- de alertas precisa: severidade, chave de deduplicação e marca de publicação
-- (substitui o booleano `processed` por um timestamp, mantido por compat).
-- ============================================================

ALTER TABLE domain_events
  ADD COLUMN IF NOT EXISTS severity     TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key   TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Dedupe: o mesmo alerta (ex.: DAS 2026-06 a vencer) não é reinserido (§14.2).
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_dedupe ON domain_events(dedupe_key);

-- Varredura eficiente do outbox: pega só o que ainda não foi publicado.
CREATE INDEX IF NOT EXISTS idx_events_unpublished ON domain_events(published_at, created_at)
  WHERE published_at IS NULL;

-- Log de emissão do fluxo MVP de NF (complementa a tabela rica `invoices`).
-- Mapeia 1:1 o InvoiceRecord do backend (apps/api).
CREATE TABLE IF NOT EXISTS issued_invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  ref_period   TEXT NOT NULL,
  tipos        TEXT[] NOT NULL,                 -- ['nfse'] | ['nfe'] | ambos
  valor_total  NUMERIC(14,2) NOT NULL,
  iss_retido   NUMERIC(14,2) NOT NULL DEFAULT 0,
  provider_ref TEXT NOT NULL,
  status       TEXT NOT NULL,                   -- issued|failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issued_inv_company ON issued_invoices(company_id, ref_period);
