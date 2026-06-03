/**
 * Classificação PF × PJ de transações bancárias (spec §1 "separação sagrada", §11).
 *
 * Lógica pura e determinística: dado o extrato (descrição, sentido, contraparte),
 * decide se a transação é receita PJ (entra no teto), despesa PJ, movimento
 * pessoal (PF) ou ambígua — e sinaliza mistura PF/PJ na conta da empresa.
 *
 * As listas de palavras-chave NÃO são valores tributários (não vão para
 * tax_rules); são heurísticas de produto, configuráveis e testáveis.
 */

export type Direction = 'inflow' | 'outflow';
export type Channel = 'pix' | 'ted' | 'boleto' | 'card' | 'other';

export type Classification =
  | 'pj_revenue'
  | 'pj_expense'
  | 'pf_personal'
  | 'tax_payment'
  | 'ambiguous';

export type PfPjFlag = 'pj' | 'pf' | 'mixed_alert' | 'unknown';

export interface BankTx {
  description: string;
  direction: Direction;
  amount: number; // sempre positivo; o sentido vem de `direction`
  occurred_at: string; // 'YYYY-MM-DD'
  channel?: Channel;
  counterparty_document?: string; // CPF (11) ou CNPJ (14), só dígitos
  counterparty_is_pj?: boolean;
  external_ref?: string; // id da transação no agregador (idempotência)
}

export interface ClassifiedTx extends BankTx {
  classification: Classification;
  counts_as_revenue: boolean;
  pf_pj_flag: PfPjFlag;
  confidence: number; // 0..1
  reasons: string[];
}

// Heurísticas (minúsculas, sem acento já normalizado na comparação).
const PERSONAL_KEYWORDS = [
  'netflix', 'spotify', 'farmacia', 'ifood', 'uber', 'mercado', 'supermercado',
  'escola', 'faculdade', 'aluguel', 'condominio', 'salario', 'familia',
  'cartao de credito', 'fatura', 'academia', 'plano de saude',
];
const TAX_KEYWORDS = ['das', 'darf', 'gps', 'inss', 'simples nacional', 'receita federal'];
const SALE_KEYWORDS = ['venda', 'pedido', 'cliente', 'nota fiscal', 'nf', 'servico', 'maquininha', 'pagamento recebido'];

const norm = (s: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const matchesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

function docKind(doc?: string): 'pj' | 'pf' | undefined {
  if (!doc) return undefined;
  const d = doc.replace(/\D/g, '');
  if (d.length === 14) return 'pj';
  if (d.length === 11) return 'pf';
  return undefined;
}

/** Classifica uma transação isolada. */
export function classifyTransaction(tx: BankTx): ClassifiedTx {
  const text = norm(tx.description);
  const reasons: string[] = [];
  const isPj = tx.counterparty_is_pj ?? (docKind(tx.counterparty_document) === 'pj');
  const counterpartyKind = docKind(tx.counterparty_document);

  let classification: Classification = 'ambiguous';
  let confidence = 0.4;
  let pf_pj_flag: PfPjFlag = 'unknown';

  // 1) Pagamento de tributo (saída) — nunca é receita; é PJ.
  if (matchesAny(text, TAX_KEYWORDS)) {
    classification = 'tax_payment';
    pf_pj_flag = 'pj';
    confidence = 0.95;
    reasons.push('descrição indica pagamento de tributo');
    return finalize(tx, classification, false, pf_pj_flag, confidence, reasons);
  }

  // 2) Gasto pessoal reconhecível.
  if (matchesAny(text, PERSONAL_KEYWORDS)) {
    classification = 'pf_personal';
    pf_pj_flag = tx.direction === 'outflow' ? 'mixed_alert' : 'pf';
    confidence = 0.8;
    reasons.push('descrição com padrão de despesa pessoal');
    if (pf_pj_flag === 'mixed_alert') reasons.push('gasto pessoal saindo da conta PJ — mistura PF/PJ');
    return finalize(tx, classification, false, pf_pj_flag, confidence, reasons);
  }

  // 3) Entradas (potencial receita).
  if (tx.direction === 'inflow') {
    if (isPj || matchesAny(text, SALE_KEYWORDS)) {
      classification = 'pj_revenue';
      pf_pj_flag = 'pj';
      confidence = isPj && matchesAny(text, SALE_KEYWORDS) ? 0.95 : isPj ? 0.85 : 0.7;
      reasons.push(isPj ? 'entrada de contraparte PJ' : 'descrição com padrão de venda');
      return finalize(tx, classification, true, pf_pj_flag, confidence, reasons);
    }
    // Entrada de PF sem padrão de venda: pode ser venda a consumidor OU aporte pessoal → ambíguo.
    classification = 'ambiguous';
    pf_pj_flag = 'unknown';
    confidence = 0.5;
    reasons.push('entrada de pessoa física sem indício claro de venda — revisar');
    return finalize(tx, classification, false, pf_pj_flag, confidence, reasons);
  }

  // 4) Saídas não-pessoais e não-tributo: despesa PJ.
  classification = 'pj_expense';
  pf_pj_flag = 'pj';
  confidence = counterpartyKind === 'pj' ? 0.8 : 0.6;
  reasons.push('saída operacional tratada como despesa PJ');
  return finalize(tx, classification, false, pf_pj_flag, confidence, reasons);
}

function finalize(
  tx: BankTx,
  classification: Classification,
  countsAsRevenue: boolean,
  pf_pj_flag: PfPjFlag,
  confidence: number,
  reasons: string[],
): ClassifiedTx {
  return { ...tx, classification, counts_as_revenue: countsAsRevenue, pf_pj_flag, confidence, reasons };
}

export function classifyMany(txs: BankTx[]): ClassifiedTx[] {
  return txs.map(classifyTransaction);
}
