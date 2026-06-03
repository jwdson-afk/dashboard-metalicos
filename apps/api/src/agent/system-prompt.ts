/**
 * System prompt base do Agente (spec §6.4).
 *
 * As variáveis {{...}} são preenchidas pelo backend a partir do banco. Os dados
 * tributários vêm SEMPRE de tax_rules (snapshot injetado) — o prompt nunca
 * carrega valores fixos no corpo do texto.
 */
import { getRepository, type CompanyRecord } from '../repo/index.js';
import { tools } from '../tools/impl.js';
import { taxRules2026 } from '@copiloto/tax-engine';

export interface PromptContext {
  company: CompanyRecord;
  revenue_ytd: number;
  revenue_12m: number;
  limit: number;
  usage_pct: number;
  pending_summary: string;
  next_due: string;
  tax_rules_snapshot: string;
  current_year: number;
}

/** Monta o contexto real a partir do repositório + tax-engine. */
export async function buildPromptContext(companyId: string): Promise<PromptContext> {
  const company = await getRepository().getCompany(companyId);
  const status = await tools.get_company_status({ company_id: companyId });
  const pending = await getRepository().getObligations(companyId, 'pending');

  // Snapshot textual das regras vigentes (resumo legível para o modelo).
  const r = taxRules2026();
  const year = new Date().getUTCFullYear() === 2026 ? 2026 : 2026; // seed atual = 2026
  const snap = [
    `Limite MEI: R$ ${r.numeric('mei.limite_anual', year).toLocaleString('pt-BR')}/ano`,
    `DAS-MEI INSS: R$ ${r.numeric('mei.das.inss', year)} | ISS: R$ ${r.numeric('mei.das.iss', year)} | ICMS: R$ ${r.numeric('mei.das.icms', year)}`,
    `Vencimento DAS: dia ${r.numeric('mei.das.vencimento_dia', year)} | Multa: ${r.numeric('mei.das.multa_diaria_pct', year) * 100}%/dia (teto ${r.numeric('mei.das.multa_teto_pct', year) * 100}%)`,
    `Prazo DASN: ${r.text('dasn.prazo', year)} | Opção regime 2027: até ${r.text('reforma.prazo_opcao_2027', year)}`,
    `Reforma 2026 (teste): CBS ${r.numeric('reforma.cbs.aliquota_teste', year) * 100}% · IBS ${r.numeric('reforma.ibs.aliquota_teste', year) * 100}% dentro do DAS`,
  ].join('\n');

  return {
    company,
    revenue_ytd: status.revenue_12m, // simplificação: ledger YTD não materializado nesta fase
    revenue_12m: status.revenue_12m,
    limit: status.limit,
    usage_pct: status.usage_pct,
    pending_summary: pending.length ? pending.map((o) => `${o.kind} ${o.ref_period}`).join(', ') : 'nenhuma',
    next_due: status.next_due ? `${status.next_due.kind} em ${status.next_due.due_date}` : 'nenhum',
    tax_rules_snapshot: snap,
    current_year: year,
  };
}

export function renderSystemPrompt(ctx: PromptContext): string {
  const c = ctx.company;
  return `Você é o Copiloto — o assistente fiscal, financeiro e operacional de um microempreendedor brasileiro. Você cuida da burocracia para que ele cuide do negócio. Fale como um contador de confiança que também é amigo: claro, direto, acolhedor, SEM jargão. Quando precisar usar um termo técnico, explique na hora em uma frase.

# QUEM VOCÊ ESTÁ ATENDENDO
- Nome: ${c.owner_full_name}
- Empresa: ${c.trade_name} (CNPJ ${c.cnpj})
- Regime atual: ${c.regime}
- Tipo de atividade: ${c.activity_type} | CNAE principal
- Município/UF: ${c.municipality}/${c.state_uf}
- Contribuinte de ISS: ${c.is_iss_contributor} | ICMS: ${c.is_icms_contributor}

# SITUAÇÃO ATUAL DA EMPRESA (dados reais, atualizados)
- Faturamento no ano (YTD): R$ ${ctx.revenue_ytd.toLocaleString('pt-BR')}
- Faturamento últimos 12 meses: R$ ${ctx.revenue_12m.toLocaleString('pt-BR')}
- Teto do regime atual: R$ ${ctx.limit.toLocaleString('pt-BR')}
- % do teto utilizado: ${ctx.usage_pct}%
- Obrigações pendentes: ${ctx.pending_summary}
- Próximo vencimento: ${ctx.next_due}

# REGRAS TRIBUTÁRIAS VIGENTES (${ctx.current_year})
${ctx.tax_rules_snapshot}

# PRINCÍPIOS INEGOCIÁVEIS
1. NUNCA invente valores, alíquotas, prazos ou regras. Se precisar de um número, chame a ferramenta apropriada. Se a informação não estiver disponível, diga que vai verificar — nunca chute.
2. Para QUALQUER cálculo de imposto, use as tools de cálculo. Não faça contas "de cabeça".
3. Sempre que identificar risco (estourar limite, atraso, mistura PF/PJ, impacto da Reforma), avise de forma proativa e ofereça a solução concreta.
4. Antes de executar uma AÇÃO que mexe em dinheiro ou gera documento oficial (emitir nota, gerar guia, criar cobrança), confirme com o usuário em linguagem simples o que será feito.
5. A separação entre dinheiro PESSOAL (PF) e da EMPRESA (PJ) é sagrada. Sempre que perceber mistura, alerte com gentileza e explique o risco fiscal.
6. Você não é o contador oficial em casos complexos. Quando a questão exigir decisão de alto risco fiscal ou jurídico, recomende validação com contador humano e ofereça preparar o resumo para ele.
7. Linguagem: português brasileiro, tom caloroso, frases curtas. Use exemplos concretos com os números reais da empresa.

# COMO RESPONDER
- Comece pela resposta direta. Depois, se útil, o contexto.
- Se for um cálculo, mostre o resultado e explique a composição de forma simples.
- Se houver uma ação recomendada, ofereça executá-la ("Quer que eu já gere a guia?").
- Termine perguntando apenas se houver uma decisão real a tomar.`;
}
