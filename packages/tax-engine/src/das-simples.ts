/**
 * Cálculo do DAS — Simples Nacional (ME/EPP) — spec §7.2.
 *
 * Fórmula oficial (LC 123/2006):
 *   Alíquota Efetiva = ((RBT12 × Alíquota Nominal) − Parcela a Deduzir) / RBT12
 *   DAS do mês       = Receita do mês × Alíquota Efetiva
 *
 * RBT12 = Receita Bruta dos últimos 12 meses. A faixa e a parcela a deduzir vêm
 * do Anexo correspondente, sempre de tax_rules.
 */
import { TaxRules, FaixaSimples } from './tax-rules.js';
import { round2 } from './money.js';
import { yearOf } from './das-mei.js';

export type AnexoSimples = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface SimplesResult {
  das: number;
  aliquota_efetiva: number;
  aliquota_nominal: number;
  faixa: number;
  deducao: number;
  rbt12: number;
  receita_mes: number;
  rule_version: string[];
}

export function encontrarFaixa(faixas: FaixaSimples[], rbt12: number): FaixaSimples {
  const faixa = faixas.find((f) => rbt12 >= f.de && rbt12 <= f.ate);
  if (!faixa) {
    throw new Error(
      `RBT12 ${rbt12} fora das faixas do Simples — possível desenquadramento (acima do teto EPP).`,
    );
  }
  return faixa;
}

export function calcularDasSimples(
  params: { anexo: AnexoSimples; rbt12: number; receita_mes: number; ref_period: string },
  rules: TaxRules,
): SimplesResult {
  const { anexo, rbt12, receita_mes, ref_period } = params;
  const year = yearOf(ref_period);

  if (rbt12 <= 0) {
    // Sem histórico (empresa nova): usa a 1ª faixa, efetiva = nominal.
    const faixas = rules.faixasSimples(anexo, year);
    const f1 = faixas[0];
    return {
      das: round2(receita_mes * f1.aliquota),
      aliquota_efetiva: f1.aliquota,
      aliquota_nominal: f1.aliquota,
      faixa: f1.faixa,
      deducao: f1.deducao,
      rbt12,
      receita_mes,
      rule_version: rules.ruleVersion(),
    };
  }

  const faixas = rules.faixasSimples(anexo, year);
  const faixa = encontrarFaixa(faixas, rbt12);
  const aliquotaEfetiva = (rbt12 * faixa.aliquota - faixa.deducao) / rbt12;
  const das = receita_mes * aliquotaEfetiva;

  return {
    das: round2(das),
    aliquota_efetiva: aliquotaEfetiva,
    aliquota_nominal: faixa.aliquota,
    faixa: faixa.faixa,
    deducao: faixa.deducao,
    rbt12,
    receita_mes,
    rule_version: rules.ruleVersion(),
  };
}
