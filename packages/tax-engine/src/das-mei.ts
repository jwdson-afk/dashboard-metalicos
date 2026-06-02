/**
 * Cálculo do DAS-MEI (spec §7.1, §2.2, §20.1).
 *
 * Valores vêm SEMPRE de tax_rules. Casos de aceite (§19):
 *   serviços (ISS)            -> R$ 86,05
 *   comércio/indústria (ICMS) -> R$ 82,05
 *   misto (ambos)             -> R$ 87,05
 */
import { TaxRules } from './tax-rules.js';
import { round2 } from './money.js';

export type ActivityType =
  | 'comercio'
  | 'industria'
  | 'servicos'
  | 'misto'
  | 'caminhoneiro';

export interface MeiCompany {
  activity_type: ActivityType;
  is_iss_contributor: boolean;
  is_icms_contributor: boolean;
}

export interface DasMeiResult {
  valor: number;
  composicao: { inss: number; icms: number; iss: number };
  rule_version: string[];
}

/** Extrai o ano de um ref_period 'YYYY-MM' ou 'YYYY'. */
export function yearOf(refPeriod: string): number {
  const year = Number.parseInt(refPeriod.slice(0, 4), 10);
  if (!Number.isInteger(year)) {
    throw new Error(`ref_period inválido: '${refPeriod}'`);
  }
  return year;
}

export function calcularDasMei(
  company: MeiCompany,
  refPeriod: string,
  rules: TaxRules,
): DasMeiResult {
  const year = yearOf(refPeriod);

  // Caminhoneiro tem regra própria de INSS (12% do salário mínimo) — §7.1, §2.2.
  const inss = company.activity_type === 'caminhoneiro'
    ? rules.numeric('mei.das.inss_caminhoneiro', year)
    : rules.numeric('mei.das.inss', year);

  const icms = company.is_icms_contributor ? rules.numeric('mei.das.icms', year) : 0;
  const iss = company.is_iss_contributor ? rules.numeric('mei.das.iss', year) : 0;

  return {
    valor: round2(inss + icms + iss),
    composicao: { inss: round2(inss), icms: round2(icms), iss: round2(iss) },
    rule_version: rules.ruleVersion(),
  };
}
