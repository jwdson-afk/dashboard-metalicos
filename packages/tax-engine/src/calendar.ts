/**
 * Calendário fiscal automático — geração de obrigações (spec §7.4).
 *
 * Função pura: dado o estado da empresa e a data de referência, retorna QUAIS
 * obrigações deveriam existir naquele momento. A persistência (UNIQUE por
 * company/kind/ref_period) e a emissão de eventos ficam no backend (job diário).
 */
import { TaxRules } from './tax-rules.js';
import { Regime } from './limits.js';

export type ObligationKind = 'das_mei' | 'das_simples' | 'dasn' | 'defis' | 'dirpf';

export interface PlannedObligation {
  kind: ObligationKind;
  ref_period: string; // 'YYYY-MM' (mensal) ou 'YYYY' (anual)
  due_date: string;   // 'YYYY-MM-DD'
}

export interface CalendarCompany {
  regime: Regime;
  opening_date: string; // 'YYYY-MM-DD'
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Vencimento do DAS no mês de referência (dia configurado em tax_rules). */
function dasDueDate(year: number, month: number, rules: TaxRules): string {
  const dia = rules.numeric('mei.das.vencimento_dia', year);
  return `${year}-${pad(month)}-${pad(dia)}`;
}

/**
 * Obrigações que devem existir para a data `today`.
 * - DAS mensal (MEI ou Simples) do mês corrente.
 * - DASN anual (MEI) quando estamos em janeiro, referente ao ano anterior.
 */
export function gerarObrigacoes(
  company: CalendarCompany,
  today: Date,
  rules: TaxRules,
): PlannedObligation[] {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1; // 1-12
  const out: PlannedObligation[] = [];

  // DAS mensal
  const dasKind: ObligationKind = company.regime === 'mei' ? 'das_mei' : 'das_simples';
  out.push({
    kind: dasKind,
    ref_period: `${year}-${pad(month)}`,
    due_date: dasDueDate(year, month, rules),
  });

  // DASN-SIMEI anual: em janeiro gera a declaração do ano anterior, prazo de tax_rules.
  if (month === 1 && company.regime === 'mei') {
    out.push({
      kind: 'dasn',
      ref_period: String(year - 1),
      due_date: rules.text('dasn.prazo', year),
    });
  }

  return out;
}
