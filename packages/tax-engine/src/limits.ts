/**
 * Monitor de limite de faturamento (spec §8.2, §9).
 *
 * Brecha comum evitada: o teto considera a receita bruta dos ÚLTIMOS 12 MESES
 * (janela móvel), não o ano-calendário. E há limite proporcional no ano de abertura.
 */
import { TaxRules } from './tax-rules.js';
import { round2 } from './money.js';

export type Regime = 'mei' | 'simples_me' | 'simples_epp' | 'nanoempr';

const LIMIT_RULE_KEY: Record<Regime, string> = {
  mei: 'mei.limite_anual',
  simples_me: 'me.limite_anual',
  simples_epp: 'epp.limite_anual',
  nanoempr: 'nanoempreendedor.limite_anual',
};

export interface Transaction {
  amount: number;
  occurred_at: string; // 'YYYY-MM-DD'
  counts_as_revenue: boolean;
}

/** Receita dos últimos 12 meses a partir de uma data de referência (§8.2). */
export function receita12m(transactions: Transaction[], refDate: Date): number {
  const start = new Date(refDate);
  start.setMonth(start.getMonth() - 12);
  const total = transactions
    .filter((t) => t.counts_as_revenue)
    .filter((t) => {
      const d = new Date(t.occurred_at);
      return d > start && d <= refDate;
    })
    .reduce((sum, t) => sum + t.amount, 0);
  return round2(total);
}

/**
 * Limite aplicável, proporcional no ano de abertura (§8.2).
 * No ano de abertura: limite/12 × meses ativos (do mês de abertura até dezembro).
 */
export function limiteProporcional(
  regime: Regime,
  openingDate: string,
  ano: number,
  rules: TaxRules,
): number {
  const limiteAnual = rules.numeric(LIMIT_RULE_KEY[regime], ano);
  const opening = new Date(openingDate);
  if (opening.getUTCFullYear() === ano) {
    const mesAbertura = opening.getUTCMonth() + 1; // 1-12
    const mesesAtivos = 12 - mesAbertura + 1;
    return round2((limiteAnual / 12) * mesesAtivos);
  }
  return limiteAnual;
}

export type LimitThreshold = 'ok' | 'info_50' | 'warning_80' | 'critical_95' | 'overflow';

export interface LimitStatus {
  regime: Regime;
  revenue_12m: number;
  limit: number;
  usage_pct: number;
  threshold: LimitThreshold;
  rule_version: string[];
}

/** Classifica o uso do teto nos limiares dos detectores (§9.1). */
export function classificarLimite(
  params: { regime: Regime; revenue_12m: number; opening_date: string; ano: number },
  rules: TaxRules,
): LimitStatus {
  const { regime, revenue_12m, opening_date, ano } = params;
  const limit = limiteProporcional(regime, opening_date, ano, rules);
  const usagePct = round2((revenue_12m / limit) * 100);

  let threshold: LimitThreshold = 'ok';
  if (revenue_12m > limit) threshold = 'overflow';
  else if (usagePct >= 95) threshold = 'critical_95';
  else if (usagePct >= 80) threshold = 'warning_80';
  else if (usagePct >= 50) threshold = 'info_50';

  return { regime, revenue_12m, limit, usage_pct: usagePct, threshold, rule_version: rules.ruleVersion() };
}
