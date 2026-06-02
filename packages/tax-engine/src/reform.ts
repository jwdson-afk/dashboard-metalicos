/**
 * Reforma Tributária — tradutor personalizado (spec §2.5, §7.3, §13.1).
 *
 * O cronograma vem de tax_rules['reforma.cronograma'] — nunca hardcoded.
 * Gera a mensagem-base humanizada por regime, que o Agente de IA refina.
 */
import { TaxRules } from './tax-rules.js';
import { Regime } from './limits.js';
import { round2 } from './money.js';

export interface ReformContext {
  regime: Regime;
  vende_b2b: boolean;
  ref_period: string; // 'YYYY-MM'
}

export interface ReformExplanation {
  base: string;
  prazo_opcao_2027?: string;
  aliquotas_teste?: { cbs: number; ibs: number };
  rule_version: string[];
}

function yearOf(refPeriod: string): number {
  return Number.parseInt(refPeriod.slice(0, 4), 10);
}

export function explicarReforma(ctx: ReformContext, rules: TaxRules): ReformExplanation {
  const year = yearOf(ctx.ref_period);
  const rv = () => rules.ruleVersion();

  if (ctx.regime === 'mei' || ctx.regime === 'nanoempr') {
    return {
      base:
        'Seu MEI foi preservado. Em 2026 quase nada muda no que você paga. ' +
        'A novidade são campos novos na nota fiscal (IBS e CBS) — eu já preencho ' +
        'automaticamente pra você.',
      aliquotas_teste: {
        cbs: rules.numeric('reforma.cbs.aliquota_teste', year),
        ibs: rules.numeric('reforma.ibs.aliquota_teste', year),
      },
      rule_version: rv(),
    };
  }

  // ME/EPP no Simples
  let base =
    'Você tem até setembro de 2026 para decidir como vai recolher IBS e CBS a partir de 2027.';
  if (ctx.vende_b2b) {
    base +=
      ' Como você vende para outras empresas, o Simples Híbrido pode valer a pena: ele ' +
      'gera crédito tributário para seus clientes, o que te deixa mais competitivo. ' +
      'Posso fazer uma simulação.';
  }
  return {
    base,
    prazo_opcao_2027: rules.text('reforma.prazo_opcao_2027', year),
    rule_version: rv(),
  };
}

/**
 * Repartição IBS/CBS de teste dentro do DAS na transição (§7.3).
 * Em 2026 são alíquotas simbólicas e compensáveis.
 */
export function repartirIbsCbs(
  receitaMes: number,
  refPeriod: string,
  rules: TaxRules,
): { cbs: number; ibs: number; rule_version: string[] } {
  const year = yearOf(refPeriod);
  const cbs = receitaMes * rules.numeric('reforma.cbs.aliquota_teste', year);
  const ibs = receitaMes * rules.numeric('reforma.ibs.aliquota_teste', year);
  return { cbs: round2(cbs), ibs: round2(ibs), rule_version: rules.ruleVersion() };
}
