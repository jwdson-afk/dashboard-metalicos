/**
 * Implementação em memória do {@link Repository} (dev, demos e testes).
 * Os dados espelham as tabelas da spec §5. O outbox é um array com dedupe.
 */
import { randomUUID } from 'node:crypto';
import type { ClassifiedTx, LedgerEntry } from '@copiloto/tax-engine';
import type {
  Repository,
  CompanyRecord,
  TransactionRecord,
  ObligationRecord,
  CustomerRecord,
  InvoiceRecord,
  ChargeRecord,
  EventRecord,
  NewEvent,
} from './types.js';

const demoCompany: CompanyRecord = {
  id: 'demo-company',
  legal_name: 'Marina Artesanato LTDA ME',
  trade_name: 'Marina Artesanato',
  cnpj: '12.345.678/0001-90',
  regime: 'mei',
  activity_type: 'misto',
  opening_date: '2023-04-01',
  municipality: 'São Paulo',
  state_uf: 'SP',
  is_iss_contributor: true,
  is_icms_contributor: true,
  owner_full_name: 'Marina Souza',
};

// ~84% do teto nos últimos 12 meses (espelha o dashboard).
function buildTransactions(): TransactionRecord[] {
  const txs: TransactionRecord[] = [];
  const start = new Date('2025-07-01');
  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    txs.push({ amount: 5670, occurred_at: d.toISOString().slice(0, 10), counts_as_revenue: true });
  }
  return txs; // 12 × 5.670 = 68.040
}

export class MemoryRepository implements Repository {
  private companies: CompanyRecord[];
  private transactions = new Map<string, TransactionRecord[]>();
  private obligations = new Map<string, ObligationRecord[]>();
  private customers = new Map<string, CustomerRecord[]>();
  private invoices: InvoiceRecord[] = [];
  private events: EventRecord[] = [];
  private dedupe = new Set<string>();
  private ledger = new Map<string, LedgerEntry[]>();
  private txRefs = new Map<string, Set<string>>();
  private charges: ChargeRecord[] = [];

  constructor(seed = true) {
    this.companies = seed ? [demoCompany] : [];
    if (seed) {
      this.transactions.set(demoCompany.id, buildTransactions());
      this.obligations.set(demoCompany.id, [
        { kind: 'das_mei', ref_period: '2026-06', due_date: '2026-06-20', amount: 87.05, status: 'pending' },
        { kind: 'das_mei', ref_period: '2026-05', due_date: '2026-05-20', amount: 87.05, status: 'paid' },
        { kind: 'dasn', ref_period: '2025', due_date: '2026-05-31', amount: null, status: 'paid' },
      ]);
      this.customers.set(demoCompany.id, [
        { name: 'Loja Bella Decor', is_pj: true, total_purchased: 28400 },
        { name: 'Ateliê Criativo', is_pj: true, total_purchased: 12100 },
        { name: 'Consumidor final', is_pj: false, total_purchased: 27540 },
      ]);
      this.charges.push({
        id: 'demo-charge-1',
        company_id: demoCompany.id,
        customer_name: 'Loja Bella Decor',
        amount: 1200,
        method: 'pix',
        due_date: '2026-06-10',
        status: 'open',
        pix_copia_cola: '00020126...DEMO-CHG',
        boleto_url: null,
        dunning_step: 0,
        created_at: '2026-06-01T00:00:00.000Z',
      });
    }
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    return [...this.companies];
  }

  async getCompany(id: string): Promise<CompanyRecord> {
    const c = this.companies.find((x) => x.id === id);
    if (!c) throw new Error(`Empresa não encontrada: ${id}`);
    return c;
  }

  async getTransactions(id: string): Promise<TransactionRecord[]> {
    return this.transactions.get(id) ?? [];
  }

  async getObligations(id: string, status?: string): Promise<ObligationRecord[]> {
    const list = this.obligations.get(id) ?? [];
    return status ? list.filter((o) => o.status === status) : [...list];
  }

  async getCustomers(id: string): Promise<CustomerRecord[]> {
    return this.customers.get(id) ?? [];
  }

  async vendeB2B(id: string): Promise<boolean> {
    return (await this.getCustomers(id)).some((c) => c.is_pj && c.total_purchased > 0);
  }

  async upsertObligation(companyId: string, ob: ObligationRecord): Promise<{ created: boolean }> {
    const list = this.obligations.get(companyId) ?? [];
    const exists = list.some((o) => o.kind === ob.kind && o.ref_period === ob.ref_period);
    if (exists) return { created: false };
    list.push(ob);
    this.obligations.set(companyId, list);
    return { created: true };
  }

  async saveClassifiedTransactions(companyId: string, txs: ClassifiedTx[]): Promise<{ inserted: number }> {
    const list = this.transactions.get(companyId) ?? [];
    const refs = this.txRefs.get(companyId) ?? new Set<string>();
    let inserted = 0;
    for (const t of txs) {
      const ref = t.external_ref ?? `${t.occurred_at}|${t.description}|${t.amount}|${t.direction}`;
      if (refs.has(ref)) continue; // idempotência por external_ref
      refs.add(ref);
      list.push({
        amount: t.amount,
        occurred_at: t.occurred_at,
        counts_as_revenue: t.counts_as_revenue,
        description: t.description,
        direction: t.direction,
        classification: t.classification,
        pf_pj_flag: t.pf_pj_flag,
        external_ref: ref,
      });
      inserted++;
    }
    this.transactions.set(companyId, list);
    this.txRefs.set(companyId, refs);
    return { inserted };
  }

  async upsertLedger(companyId: string, entries: LedgerEntry[]): Promise<void> {
    this.ledger.set(companyId, entries);
  }

  async getLedger(companyId: string): Promise<LedgerEntry[]> {
    return this.ledger.get(companyId) ?? [];
  }

  async createCharge(charge: Omit<ChargeRecord, 'id' | 'created_at'>): Promise<ChargeRecord> {
    const rec: ChargeRecord = { ...charge, id: randomUUID(), created_at: new Date().toISOString() };
    this.charges.push(rec);
    return rec;
  }

  async listCharges(companyId: string, status?: string): Promise<ChargeRecord[]> {
    return this.charges.filter((c) => c.company_id === companyId && (!status || c.status === status));
  }

  async listOpenChargesAll(): Promise<ChargeRecord[]> {
    return this.charges.filter((c) => c.status === 'open' || c.status === 'overdue');
  }

  async updateCharge(
    companyId: string,
    id: string,
    patch: Partial<Pick<ChargeRecord, 'status' | 'dunning_step'>>,
  ): Promise<void> {
    const c = this.charges.find((x) => x.id === id && x.company_id === companyId);
    if (c) Object.assign(c, patch);
  }

  async recordInvoice(inv: Omit<InvoiceRecord, 'id' | 'created_at'>): Promise<InvoiceRecord> {
    const rec: InvoiceRecord = { ...inv, id: randomUUID(), created_at: new Date().toISOString() };
    this.invoices.push(rec);
    return rec;
  }

  async appendEvent(ev: NewEvent): Promise<{ inserted: boolean; id: string }> {
    if (this.dedupe.has(ev.dedupe_key)) {
      const existing = this.events.find((e) => e.dedupe_key === ev.dedupe_key)!;
      return { inserted: false, id: existing.id };
    }
    const rec: EventRecord = {
      ...ev,
      id: randomUUID(),
      published_at: null,
      created_at: new Date().toISOString(),
    };
    this.events.push(rec);
    this.dedupe.add(ev.dedupe_key);
    return { inserted: true, id: rec.id };
  }

  async fetchUnpublishedEvents(limit: number): Promise<EventRecord[]> {
    return this.events.filter((e) => e.published_at === null).slice(0, limit);
  }

  async markPublished(ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const e of this.events) {
      if (set.has(e.id)) e.published_at = new Date().toISOString();
    }
  }
}

// Instância padrão (memória, semeada) — usada quando não há DATABASE_URL.
export const memoryRepo = new MemoryRepository();
