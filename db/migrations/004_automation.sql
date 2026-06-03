-- ============================================================
-- Migration 004 — Automação progressiva (spec §6.5).
--
-- Nível de autonomia por ação, por empresa. O produto começa conservador
-- (assisted) e o usuário libera autonomia conforme ganha confiança.
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_policies (
  company_id UUID PRIMARY KEY REFERENCES companies(id),
  policy     JSONB NOT NULL,           -- { generate_das_guia, issue_invoice, create_charge, dunning }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
