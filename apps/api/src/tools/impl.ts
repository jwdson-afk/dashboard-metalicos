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
  classifyTransaction,
  recomendarRegime,
  type AnexoSimples,
  type ItemNota,
  type Tomador,
  type BankTx,
} from '@copiloto/tax-engine';
import { getRepository } from '../repo/index.js';
import { issueWithProvider } from '../nf/provider.js';
import { getPaymentGateway, type ChargeMethod } from '../billing/gateway.js';
import { shouldExecute, type AutomatedAction, type AutomationPolicy } from '../automation.js';

const rules = () => taxRules2026();
const NOW = () => new Date(process.env.COPILOTO_FAKE_NOW ?? new Date().toISOString());
const repo = () => getRepository();

/** Política de automação decide: executar agora ou só prever para confirmação. */
async function decide(companyId: string, action: AutomatedAction, confirmed: boolean): Promise<boolean> {
  const policy = await repo().getAutomationPolicy(companyId);
  return shouldExecute(policy[action], confirmed);
}

/** Fatia do faturamento destinada a clientes PJ (CRM), para o wizard de regime. */
async function b2bShare(companyId: string): Promise<number> {
  const customers = await repo().getCustomers(companyId);
  const total = customers.reduce((s, c) => s + c.total_purchased, 0);
  if (total === 0) return 0;
  const pj = customers.filter((c) => c.is_pj).reduce((s, c) => s + c.total_purchased, 0);
  return pj / total;
}

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
   * AÇÃO (§10): emite a nota fiscal. Em modo assistido devolve o preview (sem
   * efeito colateral); só emite via provedor e persiste quando confirmado ou
   * em modo autônomo. O cálculo da nota é puro e sempre mostrado.
   */
  async issue_invoice(args: { company_id: string; ref_period?: string; tomador: Tomador; itens: ItemNota[]; confirm?: boolean }) {
    const c = await repo().getCompany(args.company_id);
    const refPeriod = args.ref_period ?? currentRefPeriod();
    const nota = montarNota(
      { regime: c.regime, is_iss_contributor: c.is_iss_contributor, ref_period: refPeriod, tomador: args.tomador, itens: args.itens },
      rules(),
    );
    const base = {
      tipos: nota.tipos,
      valor_total: nota.valor_total,
      iss_retido: nota.iss_retido,
      obrigatoria: nota.obrigatoria,
      reforma: nota.reforma,
      rule_version: nota.rule_version,
    };

    if (!(await decide(c.id, 'issue_invoice', args.confirm ?? false))) {
      return { ...base, executed: false, requires_confirmation: true };
    }

    const emitted = await issueWithProvider(c, refPeriod, nota);
    await repo().recordInvoice({
      company_id: c.id, ref_period: refPeriod, tipos: nota.tipos, valor_total: nota.valor_total,
      iss_retido: nota.iss_retido, provider_ref: emitted.provider_ref, status: emitted.status,
    });
    return { ...base, executed: true, requires_confirmation: false, provider: emitted.provider, provider_ref: emitted.provider_ref };
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

  /** Classifica uma transação avulsa PF×PJ (§11). Leitura, sem efeito. */
  async classify_transaction(args: { company_id: string; transaction: BankTx }) {
    return classifyTransaction(args.transaction);
  },

  /** Fluxo de caixa e separação PF×PJ a partir do extrato já classificado (§11). */
  async get_cashflow(args: { company_id: string }) {
    const txs = await repo().getTransactions(args.company_id);
    const ledger = await repo().getLedger(args.company_id);
    const inflow = txs.filter((t) => t.direction === 'inflow').reduce((s, t) => s + t.amount, 0);
    const outflow = txs.filter((t) => t.direction === 'outflow').reduce((s, t) => s + t.amount, 0);
    const receita = txs.filter((t) => t.counts_as_revenue).reduce((s, t) => s + t.amount, 0);
    const mistura = txs.filter((t) => t.pf_pj_flag === 'mixed_alert');
    return {
      entradas: Math.round(inflow * 100) / 100,
      saidas: Math.round(outflow * 100) / 100,
      saldo: Math.round((inflow - outflow) * 100) / 100,
      receita_reconhecida: Math.round(receita * 100) / 100,
      mistura_pf_pj: { count: mistura.length, total: Math.round(mistura.reduce((s, t) => s + t.amount, 0) * 100) / 100 },
      revenue_12m: ledger.at(-1)?.revenue_12m ?? null,
    };
  },

  /**
   * AÇÃO (§12): cria uma cobrança Pix/boleto. Em modo assistido devolve o
   * preview (sem acionar o gateway); só cria quando confirmado ou autônomo.
   */
  async create_charge(args: {
    company_id: string;
    amount: number;
    method?: ChargeMethod;
    due_date?: string;
    customer_name?: string;
    description?: string;
    confirm?: boolean;
  }) {
    const c = await repo().getCompany(args.company_id);
    const method = args.method ?? 'pix';
    const dueDate = args.due_date ?? new Date(NOW().getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const base = { method, amount: args.amount, due_date: dueDate, customer_name: args.customer_name ?? null };

    if (!(await decide(c.id, 'create_charge', args.confirm ?? false))) {
      return { ...base, executed: false, requires_confirmation: true };
    }

    const created = await getPaymentGateway().createCharge({
      company_cnpj: c.cnpj, amount: args.amount, method, due_date: dueDate, description: args.description, customer_name: args.customer_name,
    });
    const charge = await repo().createCharge({
      company_id: c.id, customer_name: args.customer_name ?? null, amount: args.amount, method, due_date: dueDate,
      status: 'open', pix_copia_cola: created.pix_copia_cola, boleto_url: created.boleto_url, dunning_step: 0,
    });
    return { ...base, executed: true, requires_confirmation: false, charge_id: charge.id, provider: created.provider, pix_copia_cola: created.pix_copia_cola, boleto_url: created.boleto_url };
  },

  /** Lista cobranças da empresa (§12). */
  async list_charges(args: { company_id: string; status?: string }) {
    return { charges: await repo().listCharges(args.company_id, args.status) };
  },

  /** CRM: clientes da empresa (§12). */
  async list_customers(args: { company_id: string }) {
    return { customers: await repo().getCustomers(args.company_id) };
  },

  /** Wizard de decisão de regime 2027 (§13.2). Leitura, sem efeito. */
  async recommend_regime(args: { company_id: string }) {
    const c = await repo().getCompany(args.company_id);
    const txs = await repo().getTransactions(c.id);
    const rev12 = receita12m(txs, NOW());
    const mediaMensal = rev12 / 12;
    return recomendarRegime(
      {
        regime: c.regime,
        revenue_12m: rev12,
        projected_revenue_12m: Math.round((rev12 + mediaMensal * 6) * 100) / 100, // projeção 6 meses
        b2b_share: await b2bShare(c.id),
        ref_period: currentRefPeriod(),
      },
      rules(),
    );
  },

  /** Lê a política de automação progressiva da empresa (§6.5). */
  async get_automation(args: { company_id: string }) {
    return await repo().getAutomationPolicy(args.company_id);
  },

  /** AÇÃO de configuração: ajusta o nível de autonomia por ação (§6.5). */
  async set_automation(args: { company_id: string; policy: Partial<AutomationPolicy> }) {
    return await repo().setAutomationPolicy(args.company_id, args.policy);
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
