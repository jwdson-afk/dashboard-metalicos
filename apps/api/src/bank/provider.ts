/**
 * Provedor de Open Finance (spec §11). Abstrai o agregador bancário.
 *   BANK_PROVIDER=pluggy + PLUGGY_CLIENT_ID/SECRET → adaptador Pluggy (estrutural)
 *   (default)                                       → stub com extrato de exemplo
 *
 * Retorna transações no formato `BankTx` do tax-engine, prontas para classificar.
 */
import type { BankTx } from '@copiloto/tax-engine';
import type { CompanyRecord } from '../repo/types.js';

export interface BankProvider {
  readonly name: string;
  fetchTransactions(company: CompanyRecord, since: string): Promise<BankTx[]>;
}

/**
 * Stub determinístico — extrato de exemplo que cobre os casos de classificação:
 * vendas PJ, venda na maquininha, pagamento de DAS e um gasto pessoal (mistura).
 * Não chama rede.
 */
export class StubBankProvider implements BankProvider {
  readonly name = 'stub';
  async fetchTransactions(_company: CompanyRecord, _since: string): Promise<BankTx[]> {
    return [
      { description: 'Pagamento pedido #1042', direction: 'inflow', amount: 3200, occurred_at: '2026-06-03', channel: 'pix', counterparty_is_pj: true, counterparty_document: '11222333000181' },
      { description: 'Venda na maquininha', direction: 'inflow', amount: 1850, occurred_at: '2026-06-07', channel: 'card', counterparty_document: '12345678909' },
      { description: 'Transferência recebida', direction: 'inflow', amount: 500, occurred_at: '2026-06-09', channel: 'pix', counterparty_document: '98765432100' },
      { description: 'DAS Simples Nacional', direction: 'outflow', amount: 87.05, occurred_at: '2026-06-20', channel: 'boleto' },
      { description: 'Netflix assinatura', direction: 'outflow', amount: 55.9, occurred_at: '2026-06-12', channel: 'card' },
      { description: 'Compra de insumos', direction: 'outflow', amount: 640, occurred_at: '2026-06-14', channel: 'pix', counterparty_is_pj: true, counterparty_document: '55666777000122' },
    ];
  }
}

/**
 * Adaptador Pluggy (estrutural). Ativado por BANK_PROVIDER=pluggy + credenciais.
 * Não exercitado em testes (sem rede). Mapeia o payload do Pluggy para BankTx.
 */
export class PluggyBankProvider implements BankProvider {
  readonly name = 'pluggy';
  constructor(
    private clientId = process.env.PLUGGY_CLIENT_ID ?? '',
    private clientSecret = process.env.PLUGGY_CLIENT_SECRET ?? '',
    private baseUrl = process.env.PLUGGY_URL ?? 'https://api.pluggy.ai',
    private resolveAccountId: (companyId: string) => Promise<string> = async () => process.env.PLUGGY_ACCOUNT_ID ?? '',
  ) {}

  private async apiKey(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
    });
    const json = (await res.json()) as { apiKey: string };
    return json.apiKey;
  }

  async fetchTransactions(company: CompanyRecord, since: string): Promise<BankTx[]> {
    if (!this.clientId || !this.clientSecret) throw new Error('Credenciais Pluggy ausentes.');
    const apiKey = await this.apiKey();
    const accountId = await this.resolveAccountId(company.id);
    const res = await fetch(`${this.baseUrl}/transactions?accountId=${accountId}&from=${since}`, {
      headers: { 'X-API-KEY': apiKey },
    });
    const json = (await res.json()) as { results: any[] };
    return (json.results ?? []).map((t) => ({
      description: t.description ?? '',
      direction: t.amount >= 0 ? 'inflow' : 'outflow',
      amount: Math.abs(t.amount),
      occurred_at: String(t.date).slice(0, 10),
      channel: 'other',
      counterparty_document: t.paymentData?.payer?.documentNumber?.value,
      external_ref: t.id,
    }));
  }
}

let cached: BankProvider | null = null;
export function getBankProvider(): BankProvider {
  if (cached) return cached;
  cached = process.env.BANK_PROVIDER === 'pluggy' ? new PluggyBankProvider() : new StubBankProvider();
  return cached;
}
