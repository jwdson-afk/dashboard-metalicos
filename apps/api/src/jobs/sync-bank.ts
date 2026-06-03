/**
 * Sincronização Open Finance (spec §11).
 *
 * Para cada empresa: busca o extrato no provedor, classifica PF×PJ, persiste as
 * transações (idempotente por external_ref), reconstrói o ledger de receita
 * (§5.3) e emite no outbox o evento de mistura PF/PJ quando houver (§9.1).
 */
import {
  classifyMany,
  buildRevenueLedger,
  detectarMistura,
  type ClassifiedTx,
} from '@copiloto/tax-engine';
import type { Repository } from '../repo/types.js';
import { getBankProvider, type BankProvider } from '../bank/provider.js';

export interface SyncResult {
  companies: number;
  transactions_inserted: number;
  ledger_months: number;
  mixing_events: number;
}

export async function runBankSync(
  repo: Repository,
  now: Date,
  provider: BankProvider = getBankProvider(),
  sinceDays = 90,
): Promise<SyncResult> {
  const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const companies = await repo.listCompanies();
  let inserted = 0;
  let ledgerMonths = 0;
  let mixingEvents = 0;

  for (const c of companies) {
    const raw = await provider.fetchTransactions(c, since);
    const classified: ClassifiedTx[] = classifyMany(raw);

    const { inserted: ins } = await repo.saveClassifiedTransactions(c.id, classified);
    inserted += ins;

    // Reconstrói o ledger a partir de TODAS as transações da empresa.
    const all = await repo.getTransactions(c.id);
    const ledger = buildRevenueLedger(all);
    await repo.upsertLedger(c.id, ledger);
    ledgerMonths += ledger.length;

    // Mistura PF/PJ → outbox (dedupe por mês de referência).
    const refMonth = now.toISOString().slice(0, 7);
    for (const ev of detectarMistura(
      classified.map((t) => ({ description: t.description, amount: t.amount, occurred_at: t.occurred_at, pf_pj_flag: t.pf_pj_flag })),
    )) {
      const { inserted: did } = await repo.appendEvent({
        company_id: c.id,
        event_type: ev.event_type,
        severity: ev.severity,
        payload: ev.payload as Record<string, unknown>,
        dedupe_key: `${c.id}:${ev.event_type}:${refMonth}`,
      });
      if (did) mixingEvents++;
    }
  }

  return { companies: companies.length, transactions_inserted: inserted, ledger_months: ledgerMonths, mixing_events: mixingEvents };
}
