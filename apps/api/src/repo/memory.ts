/**
 * Implementação em memória do {@link Repository} (dev, demos e testes).
 * Os dados espelham as tabelas da spec §5. O outbox é um array com dedupe.
 */
import { randomUUID } from 'node:crypto';
import type {
  Repository,
  CompanyRecord,
  TransactionRecord,
  ObligationRecord,
  CustomerRecord,
  InvoiceRecord,
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
