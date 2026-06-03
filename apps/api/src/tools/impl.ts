/**
 * Implementação das ferramentas do Agente (spec §6.3).
 * Toda lógica tributária delega ao @copiloto/tax-engine — zero números hardcoded aqui.
 * Persistência via {@link Repository} (assíncrono): memória ou PostgreSQL.
 */
import {
  taxRules2026,
  calcularDasMei,
  calcularDasSimples,
  classificarLimite,
  receita12m,
  explicarReforma,
  calcularMulta,
  validarEmissao,
  montarNota,
  type AnexoSimples,
  type ItemNota,
  type Tomador,
} from '@copiloto/tax-engine';
import { getRepository } from '../repo/index.js';
import { issueWithProvider } from '../nf/provider.js';

const rules = () => taxRules2026();
const NOW = () => new Date(process.env.COPILOTO_FAKE_NOW ?? new Date().toISOString());
const repo = () => getRepository();

function currentRefPeriod(d = NOW()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const tools = {
  async get_company_status(args: { company_id: string }) {
    const c = await repo().getCompany(args.company_id);
    const rev12 = receita12m(await repo().getTransactions(c.id), NOW());
    const status = classificarLimite(
      { regime: c.regime, revenue_12m: rev12, opening_date: c.opening_date, ano: NOW().getUTCFullYear() },
      rules(),
    );
    const pending = await repo().getObligations(c.id, 'pending');
    return {
      regime: c.regime,
      activity_type: c.activity_type,
      revenue_12m: status.revenue_12m,
      limit: status.limit,
      usage_pct: status.usage_pct,
      threshold: status.threshold,
      pending_obligations: pending.length,
      next_due: pending[0] ? { kind: pending[0].kind, due_date: pending[0].due_date, amount: pending[0].amount } : null,
    };
  },

  async calculate_das_mei(args: { company_id: string; ref_period?: string }) {
    const c = await repo().getCompany(args.company_id);
    return calcularDasMei(
      { activity_type: c.activity_type, is_iss_contributor: c.is_iss_contributor, is_icms_contributor: c.is_icms_contributor },
      args.ref_period ?? currentRefPeriod(),
      rules(),
    );
  },

  async calculate_das_simples(args: { company_id: string; ref_period?: string }) {
    const c = await repo().getCompany(args.company_id);
    if (!c.simples_anexo) throw new Error('Empresa não está no Simples (sem anexo). Use calculate_das_mei.');
    const refPeriod = args.ref_period ?? currentRefPeriod();
    const txs = await repo().getTransactions(c.id);
    const rbt12 = receita12m(txs, NOW());
    const receitaMes = txs
      .filter((t) => t.counts_as_revenue && t.occurred_at.startsWith(refPeriod))
      .reduce((s, t) => s + t.amount, 0);
    return calcularDasSimples({ anexo: c.simples_anexo as AnexoSimples, rbt12, receita_mes: receitaMes, ref_period: refPeriod }, rules());
  },

  async check_limit_projection(args: { company_id: string }) {
    const c = await repo().getCompany(args.company_id);
    const rev12 = receita12m(await repo().getTransactions(c.id), NOW());
    const status = classificarLimite(
      { regime: c.regime, revenue_12m: rev12, opening_date: c.opening_date, ano: NOW().getUTCFullYear() },
      rules(),
    );
    const mediaMensal = rev12 / 12;
    const margem = status.limit - rev12;
    const mesesAteEstouro = mediaMensal > 0 ? Math.floor(margem / mediaMensal) : null;
    return {
      ...status,
      media_mensal: Math.round(mediaMensal * 100) / 100,
      margem_ate_teto: Math.round(margem * 100) / 100,
      meses_ate_estouro: mesesAteEstouro,
    };
  },

  async explain_reform_impact(args: { company_id: string }) {
    const c = await repo().getCompany(args.company_id);
    return explicarReforma({ regime: c.regime, vende_b2b: await repo().vendeB2B(c.id), ref_period: currentRefPeriod() }, rules());
  },

  async list_obligations(args: { company_id: string; status?: string }) {
    return { obligations: await repo().getObligations(args.company_id, args.status) };
  },

  /** AÇÃO (§6.3): exige confirmação do usuário antes no MVP. */
  async generate_das_guia(args: { company_id: string; ref_period?: string }) {
    const r = await tools.calculate_das_mei(args);
    const c = await repo().getCompany(args.company_id);
    const refPeriod = args.ref_period ?? currentRefPeriod();
    return {
      requires_confirmation: true,
      ref_period: refPeriod,
      amount: r.valor,
      composicao: r.composicao,
      pix_copia_cola: `00020126...DEMO-${c.cnpj.replace(/\D/g, '')}-${refPeriod}`, // stub do gateway
      rule_version: r.rule_version,
    };
  },

  /** Valida uma nota antes de emitir (§10). Leitura, sem efeito. */
  async validate_invoice(args: { company_id: string; ref_period?: string; tomador: Tomador; itens: ItemNota[] }) {
    const c = await repo().getCompany(args.company_id);
    return validarEmissao(
      {
        regime: c.regime,
        is_iss_contributor: c.is_iss_contributor,
        ref_period: args.ref_period ?? currentRefPeriod(),
        tomador: args.tomador,
        itens: args.itens,
      },
      rules(),
    );
  },

  /**
   * AÇÃO (§10): emite a nota fiscal via provedor (PlugNotas/Focus ou stub),
   * persiste o registro e devolve o preview de confirmação.
   */
  async issue_invoice(args: { company_id: string; ref_period?: string; tomador: Tomador; itens: ItemNota[] }) {
    const c = await repo().getCompany(args.company_id);
    const refPeriod = args.ref_period ?? currentRefPeriod();
    const nota = montarNota(
      { regime: c.regime, is_iss_contributor: c.is_iss_contributor, ref_period: refPeriod, tomador: args.tomador, itens: args.itens },
      rules(),
    );
    const emitted = await issueWithProvider(c, refPeriod, nota);
    await repo().recordInvoice({
      company_id: c.id,
      ref_period: refPeriod,
      tipos: nota.tipos,
      valor_total: nota.valor_total,
      iss_retido: nota.iss_retido,
      provider_ref: emitted.provider_ref,
      status: emitted.status,
    });
    return {
      requires_confirmation: true,
      tipos: nota.tipos,
      valor_total: nota.valor_total,
      iss_retido: nota.iss_retido,
      obrigatoria: nota.obrigatoria,
      reforma: nota.reforma,
      provider: emitted.provider,
      provider_ref: emitted.provider_ref,
      rule_version: nota.rule_version,
    };
  },

  /** Simulação MEI → ME (Simples). Leitura, sem efeito. */
  async simulate_migration(args: { company_id: string; target_regime?: 'simples_me' }) {
    const c = await repo().getCompany(args.company_id);
    const rev12 = receita12m(await repo().getTransactions(c.id), NOW());
    const refPeriod = currentRefPeriod();
    const dasMei = calcularDasMei(
      { activity_type: c.activity_type, is_iss_contributor: c.is_iss_contributor, is_icms_contributor: c.is_icms_contributor },
      refPeriod,
      rules(),
    );
    const receitaMes = rev12 / 12;
    const simples = calcularDasSimples({ anexo: 'III', rbt12: rev12, receita_mes: receitaMes, ref_period: refPeriod }, rules());
    return {
      atual_mei: { das_mensal: dasMei.valor },
      simulado_me_anexo_III: {
        rbt12: rev12,
        aliquota_efetiva: Math.round(simples.aliquota_efetiva * 10000) / 100,
        das_mensal_estimado: simples.das,
      },
      observacao: 'Estimativa. A migração para ME exige validação contábil e a alíquota depende do anexo correto.',
    };
  },

  /** Multa por atraso de uma obrigação (helper para o detector de DAS vencido). */
  async calculate_penalty(args: { company_id: string; ref_period: string; selic_acumulada?: number }) {
    const c = await repo().getCompany(args.company_id);
    const obs = await repo().getObligations(c.id);
    const ob = obs.find((o) => o.ref_period === args.ref_period && o.amount != null);
    if (!ob || ob.amount == null) throw new Error('Obrigação monetária não encontrada para o período.');
    return calcularMulta(
      { amount: ob.amount, due_date: ob.due_date, today: NOW(), selic_acumulada: args.selic_acumulada ?? 0, year: NOW().getUTCFullYear() },
      rules(),
    );
  },
};

export type ToolName = keyof typeof tools;

export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const fn = (tools as Record<string, (a: any) => Promise<unknown>>)[name];
  if (!fn) throw new Error(`Ferramenta desconhecida: ${name}`);
  return fn(args);
}
