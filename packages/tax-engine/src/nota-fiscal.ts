/**
 * Notas Fiscais (spec §10) — lógica de domínio pura.
 *
 * Decide TIPO da nota (NFS-e p/ serviço × NF-e p/ produto), VALIDA antes de
 * emitir, calcula RETENÇÃO de ISS quando o tomador é PJ e preenche os campos da
 * Reforma (IBS/CBS) automaticamente. A emissão real é delegada a um provedor
 * externo (PlugNotas/Focus) atrás de uma interface — aqui fica só a regra.
 *
 * Princípio inegociável: alíquotas e limites vêm SEMPRE de tax_rules.
 */
import { TaxRules } from './tax-rules.js';
import { Regime } from './limits.js';
import { round2 } from './money.js';
import { yearOf } from './das-mei.js';

export type NotaTipo = 'nfse' | 'nfe';
export type NaturezaItem = 'servico' | 'produto';

export interface ItemNota {
  natureza: NaturezaItem;
  descricao: string;
  valor: number;
  /** serviço sujeito a retenção de ISS na fonte (lista municipal). */
  servico_sujeito_retencao_iss?: boolean;
}

export interface Tomador {
  is_pj: boolean;
  documento: string; // CPF (11) ou CNPJ (14), apenas dígitos
  nome: string;
}

export interface EmitirNotaContext {
  regime: Regime;
  is_iss_contributor: boolean;
  ref_period: string; // 'YYYY-MM'
  tomador: Tomador;
  itens: ItemNota[];
}

export interface ValidationResult {
  ok: boolean;
  erros: string[];
}

export interface NotaCalculada {
  tipos: NotaTipo[];           // pode ser ['nfse'], ['nfe'] ou ambas (misto)
  valor_total: number;
  iss_retido: number;          // ISS retido na fonte pelo tomador PJ
  obrigatoria: boolean;        // emissão obrigatória? (MEI dispensado p/ PF)
  reforma: { cbs: number; ibs: number }; // valores informativos na nota (2026)
  rule_version: string[];
}

const so_digitos = (s: string) => s.replace(/\D/g, '');

/** Tipo de nota por natureza do item (§10): serviço → NFS-e, produto → NF-e. */
export function determinarTipo(natureza: NaturezaItem): NotaTipo {
  return natureza === 'servico' ? 'nfse' : 'nfe';
}

/** Validações que bloqueiam a emissão (§10). */
export function validarEmissao(ctx: EmitirNotaContext, rules: TaxRules): ValidationResult {
  const year = yearOf(ctx.ref_period);
  const erros: string[] = [];

  if (ctx.itens.length === 0) erros.push('A nota precisa de ao menos um item.');

  const valorMin = rules.numeric('nf.valor_minimo', year);
  for (const [i, item] of ctx.itens.entries()) {
    if (!item.descricao?.trim()) erros.push(`Item ${i + 1}: descrição obrigatória.`);
    if (!(item.valor >= valorMin)) erros.push(`Item ${i + 1}: valor deve ser ≥ R$ ${valorMin}.`);
  }

  const doc = so_digitos(ctx.tomador.documento ?? '');
  const docOk = ctx.tomador.is_pj ? doc.length === 14 : doc.length === 11;
  if (!docOk) {
    erros.push(`Documento do tomador inválido (${ctx.tomador.is_pj ? 'CNPJ' : 'CPF'} esperado).`);
  }
  if (!ctx.tomador.nome?.trim()) erros.push('Nome do tomador obrigatório.');

  return { ok: erros.length === 0, erros };
}

/**
 * Monta a nota calculada. Lança se a validação falhar — o backend deve chamar
 * `validarEmissao` antes e confirmar com o usuário (é uma AÇÃO oficial).
 */
export function montarNota(ctx: EmitirNotaContext, rules: TaxRules): NotaCalculada {
  const v = validarEmissao(ctx, rules);
  if (!v.ok) throw new Error(`Nota inválida: ${v.erros.join(' ')}`);

  const year = yearOf(ctx.ref_period);
  const tipos = [...new Set(ctx.itens.map((i) => determinarTipo(i.natureza)))];
  const valorTotal = round2(ctx.itens.reduce((s, i) => s + i.valor, 0));

  // ISS retido na fonte: só quando o tomador é PJ e o serviço está na lista de retenção.
  // Para MEI/Simples o ISS próprio já está no DAS; aqui tratamos apenas a retenção.
  const aliqRet = rules.numeric('nf.iss.aliquota_retencao_padrao', year);
  const baseRetencao = ctx.tomador.is_pj
    ? ctx.itens
        .filter((i) => i.natureza === 'servico' && i.servico_sujeito_retencao_iss && ctx.is_iss_contributor)
        .reduce((s, i) => s + i.valor, 0)
    : 0;
  const issRetido = round2(baseRetencao * aliqRet);

  // Obrigatoriedade (§10): MEI é dispensado de emitir para consumidor PF, mas
  // a emissão é SEMPRE obrigatória quando o tomador é PJ.
  const obrigatoria = ctx.tomador.is_pj || ctx.regime !== 'mei';

  // Campos da Reforma preenchidos automaticamente na nota (fase de teste 2026).
  const cbs = round2(valorTotal * rules.numeric('reforma.cbs.aliquota_teste', year));
  const ibs = round2(valorTotal * rules.numeric('reforma.ibs.aliquota_teste', year));

  return {
    tipos,
    valor_total: valorTotal,
    iss_retido: issRetido,
    obrigatoria,
    reforma: { cbs, ibs },
    rule_version: rules.ruleVersion(),
  };
}
