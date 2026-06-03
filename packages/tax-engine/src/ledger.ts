/**
 * Ledger de receita (spec §5.3 `revenue_ledger`, §8.2 janela móvel).
 *
 * Materializa, mês a mês, a receita reconhecida (apenas transações com
 * `counts_as_revenue`), com YTD e a janela móvel de 12 meses — a base real do
 * monitor de limite. Função pura: o teto e o % vêm de quem chama (tax_rules).
 */
import { round2 } from './money.js';

export interface RevenueTx {
  amount: number;
  occurred_at: string; // 'YYYY-MM-DD'
  counts_as_revenue: boolean;
}

export interface LedgerEntry {
  ref_year: number;
  ref_month: number;
  ref_period: string;     // 'YYYY-MM'
  revenue_month: number;
  revenue_ytd: number;    // acumulado no ano-calendário até o mês
  revenue_12m: number;    // janela móvel terminando neste mês (inclusive)
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Soma a receita por mês (apenas o que conta para o teto). */
function monthlyTotals(txs: RevenueTx[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (!t.counts_as_revenue) continue;
    const key = t.occurred_at.slice(0, 7); // 'YYYY-MM'
    totals.set(key, round2((totals.get(key) ?? 0) + t.amount));
  }
  return totals;
}

/**
 * Constrói o ledger para os 12 meses que terminam em `endPeriod` (default: o
 * mês mais recente com receita). Retorna em ordem cronológica.
 */
export function buildRevenueLedger(txs: RevenueTx[], endPeriod?: string): LedgerEntry[] {
  const totals = monthlyTotals(txs);
  if (totals.size === 0) return [];

  const end = endPeriod ?? [...totals.keys()].sort().at(-1)!;
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));

  const entries: LedgerEntry[] = [];
  // 12 meses terminando em end (inclusive).
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(endYear, endMonth - 1 - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const revenue_month = totals.get(periodKey(year, month)) ?? 0;

    // janela móvel de 12m terminando neste mês.
    let rev12 = 0;
    for (let j = 0; j < 12; j++) {
      const w = new Date(Date.UTC(year, month - 1 - j, 1));
      rev12 += totals.get(periodKey(w.getUTCFullYear(), w.getUTCMonth() + 1)) ?? 0;
    }

    // YTD no ano-calendário.
    let ytd = 0;
    for (let m = 1; m <= month; m++) ytd += totals.get(periodKey(year, m)) ?? 0;

    entries.push({
      ref_year: year,
      ref_month: month,
      ref_period: periodKey(year, month),
      revenue_month: round2(revenue_month),
      revenue_ytd: round2(ytd),
      revenue_12m: round2(rev12),
    });
  }
  return entries;
}

/** Receita acumulada nos últimos 12 meses a partir do ledger (último mês). */
export function revenue12mFromLedger(entries: LedgerEntry[]): number {
  return entries.at(-1)?.revenue_12m ?? 0;
}
