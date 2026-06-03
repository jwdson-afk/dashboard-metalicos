-- ============================================================
-- Migration 003 — Open Finance (spec §11).
--
-- Garante idempotência da sincronização bancária: a mesma transação do extrato
-- (external_ref do agregador) não é inserida duas vezes.
-- ============================================================

-- external_ref pode repetir entre empresas, mas é único dentro de uma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_company_extref
  ON transactions(company_id, external_ref)
  WHERE external_ref IS NOT NULL;
