/**
 * Multa e juros por atraso (spec §7.5, §2.2, §20.1).
 *
 *   multa = valor × multa_diaria_pct × dias_atraso   (limitada a multa_teto_pct)
 *   juros = valor × selic_acumulada(vencimento, hoje)
 *
 * A Selic é injetada (vem de integração externa), nunca chutada.
 */
import { TaxRules } from './tax-rules.js';
import { round2 } from './money.js';

export interface PenaltyResult {
  multa: number;
  juros: number;
  total: number;
  dias_atraso: number;
  rule_version: string[];
}

function diffDays(due: Date, today: Date): number {
  const ms = today.getTime() - due.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function calcularMulta(
  params: { amount: number; due_date: string; today: Date; selic_acumulada?: number; year: number },
  rules: TaxRules,
): PenaltyResult {
  const { amount, due_date, today, selic_acumulada = 0, year } = params;
  const due = new Date(due_date);
  const dias = diffDays(due, today);

  if (dias <= 0) {
    return { multa: 0, juros: 0, total: 0, dias_atraso: 0, rule_version: rules.ruleVersion() };
  }

  const diariaPct = rules.numeric('mei.das.multa_diaria_pct', year);
  const tetoPct = rules.numeric('mei.das.multa_teto_pct', year);

  const multaBruta = amount * diariaPct * dias;
  const multa = Math.min(multaBruta, amount * tetoPct);
  const juros = amount * selic_acumulada;

  return {
    multa: round2(multa),
    juros: round2(juros),
    total: round2(multa + juros),
    dias_atraso: dias,
    rule_version: rules.ruleVersion(),
  };
}
