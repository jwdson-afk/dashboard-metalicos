/**
 * Wizard de decisão de regime para a Reforma 2027 (spec §13.2, §18 Fase 5).
 *
 * Recomendação determinística a partir do perfil da empresa: faturamento (real e
 * projetado), fatia B2B e atividade. Os limites e o prazo de opção vêm SEMPRE de
 * tax_rules; os limiares de decisão (ex.: fatia B2B relevante) são config de
 * produto, explícitos e testáveis.
 */
import { TaxRules } from './tax-rules.js';
import { Regime } from './limits.js';

export type RegimeRecommendation =
  | 'manter_mei'
  | 'migrar_me'
  | 'simples_comum'
  | 'simples_hibrido';

export interface RegimeAdvisorInput {
  regime: Regime;
  revenue_12m: number;
  projected_revenue_12m?: number; // projeção; default = revenue_12m
  b2b_share: number;              // 0..1 — fração do faturamento para PJ
  ref_period: string;             // 'YYYY-MM'
}

export interface RegimeAdvice {
  recommendation: RegimeRecommendation;
  urgency: 'baixa' | 'media' | 'alta';
  reasons: string[];
  prazo_opcao_2027: string;
  alternativas: RegimeRecommendation[];
  rule_version: string[];
}

/** Fatia B2B a partir da qual o Simples Híbrido tende a compensar (gera crédito). */
export const B2B_SHARE_RELEVANTE = 0.3;

function yearOf(refPeriod: string): number {
  return Number.parseInt(refPeriod.slice(0, 4), 10);
}

export function recomendarRegime(input: RegimeAdvisorInput, rules: TaxRules): RegimeAdvice {
  const year = yearOf(input.ref_period);
  const meiLimite = rules.numeric('mei.limite_anual', year);
  const prazo = rules.text('reforma.prazo_opcao_2027', year);
  const projetado = input.projected_revenue_12m ?? input.revenue_12m;
  const reasons: string[] = [];

  // Caminho MEI: fica ou migra?
  if (input.regime === 'mei' || input.regime === 'nanoempr') {
    const estouraReal = input.revenue_12m > meiLimite;
    const estouraProjetado = projetado > meiLimite;

    if (estouraReal || estouraProjetado) {
      reasons.push(
        estouraReal
          ? `Faturamento de 12 meses (R$ ${input.revenue_12m.toLocaleString('pt-BR')}) já passou do teto do MEI (R$ ${meiLimite.toLocaleString('pt-BR')}).`
          : `No ritmo atual, você deve ultrapassar o teto do MEI (R$ ${meiLimite.toLocaleString('pt-BR')}) em breve.`,
      );
      const hibrido = input.b2b_share >= B2B_SHARE_RELEVANTE;
      if (hibrido) reasons.push(`Você vende bastante para empresas (${Math.round(input.b2b_share * 100)}% B2B): como ME, o Simples Híbrido gera crédito para seus clientes.`);
      return {
        recommendation: hibrido ? 'simples_hibrido' : 'migrar_me',
        urgency: estouraReal ? 'alta' : 'media',
        reasons,
        prazo_opcao_2027: prazo,
        alternativas: hibrido ? ['migrar_me', 'simples_comum'] : ['simples_comum'],
        rule_version: rules.ruleVersion(),
      };
    }

    reasons.push('Seu faturamento está dentro do teto do MEI e o regime foi preservado na Reforma.');
    reasons.push('Em 2026 muda só a nota fiscal (campos de IBS/CBS), que eu preencho automaticamente.');
    return {
      recommendation: 'manter_mei',
      urgency: 'baixa',
      reasons,
      prazo_opcao_2027: prazo,
      alternativas: [],
      rule_version: rules.ruleVersion(),
    };
  }

  // Caminho ME/EPP no Simples: comum × híbrido.
  const hibrido = input.b2b_share >= B2B_SHARE_RELEVANTE;
  if (hibrido) {
    reasons.push(`Com ${Math.round(input.b2b_share * 100)}% das vendas para empresas, o Simples Híbrido tende a compensar: seus clientes PJ aproveitam o crédito de IBS/CBS e você fica mais competitivo.`);
  } else {
    reasons.push('Suas vendas são majoritariamente para consumidor final, então o Simples comum costuma ser mais simples e vantajoso — o crédito do híbrido beneficia pouco aqui.');
  }
  reasons.push(`Você tem até ${prazo} para fazer a opção válida a partir de 2027.`);
  return {
    recommendation: hibrido ? 'simples_hibrido' : 'simples_comum',
    urgency: 'media',
    reasons,
    prazo_opcao_2027: prazo,
    alternativas: hibrido ? ['simples_comum'] : ['simples_hibrido'],
    rule_version: rules.ruleVersion(),
  };
}
