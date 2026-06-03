/**
 * Implementação PostgreSQL do {@link Repository} (spec §5).
 *
 * Estruturalmente completa; ativada por `DATABASE_URL`. Não é exercitada nos
 * testes automatizados (que rodam sem banco) — a cobertura de regra fica na
 * MemoryRepository, que compartilha o mesmo contrato. O outbox usa INSERT com
 * `ON CONFLICT (dedupe_key) DO NOTHING` para idempotência (§14.2).
 *
 * Requer a dependência opcional `pg` (carregada dinamicamente).
 */
import type { ClassifiedTx, LedgerEntry } from '@copiloto/tax-engine';
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

// Tipagem mínima local para não acoplar o build ao @types/pg.
interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

export class PostgresRepository implements Repository {
  private poolPromise: Promise<PoolLike>;

  constructor(connectionString: string) {
    this.poolPromise = import('pg').then((pg) => {
      const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
      return new Pool({ connectionString }) as PoolLike;
    });
  }

  private async q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.poolPromise;
    const { rows } = await pool.query(text, params);
    return rows as T[];
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    return this.q<CompanyRecord>('SELECT * FROM companies ORDER BY created_at');
  }

  async getCompany(id: string): Promise<CompanyRecord> {
    const [c] = await this.q<CompanyRecord>('SELECT * FROM companies WHERE id = $1', [id]);
    if (!c) throw new Error(`Empresa não encontrada: ${id}`);
    return c;
  }

  async getTransactions(id: string): Promise<TransactionRecord[]> {
    return this.q<TransactionRecord>(
      'SELECT amount, occurred_at, counts_as_revenue FROM transactions WHERE company_id = $1',
      [id],
    );
  }

  async getObligations(id: string, status?: string): Promise<ObligationRecord[]> {
    if (status) {
      return this.q<ObligationRecord>(
        'SELECT kind, ref_period, due_date, amount, status FROM tax_obligations WHERE company_id = $1 AND status = $2 ORDER BY due_date',
        [id, status],
      );
    }
    return this.q<ObligationRecord>(
      'SELECT kind, ref_period, due_date, amount, status FROM tax_obligations WHERE company_id = $1 ORDER BY due_date',
      [id],
    );
  }

  async getCustomers(id: string): Promise<CustomerRecord[]> {
    return this.q<CustomerRecord>(
      'SELECT name, is_pj, total_purchased FROM customers WHERE company_id = $1',
      [id],
    );
  }

  async vendeB2B(id: string): Promise<boolean> {
    const [r] = await this.q<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM customers WHERE company_id = $1 AND is_pj AND total_purchased > 0) AS exists',
      [id],
    );
    return Boolean(r?.exists);
  }

  async upsertObligation(companyId: string, ob: ObligationRecord): Promise<{ created: boolean }> {
    const rows = await this.q(
      `INSERT INTO tax_obligations (company_id, kind, ref_period, due_date, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (company_id, kind, ref_period) DO NOTHING
       RETURNING id`,
      [companyId, ob.kind, ob.ref_period, ob.due_date, ob.amount, ob.status],
    );
    return { created: rows.length > 0 };
  }

  async saveClassifiedTransactions(companyId: string, txs: ClassifiedTx[]): Promise<{ inserted: number }> {
    let inserted = 0;
    for (const t of txs) {
      const ref = t.external_ref ?? `${t.occurred_at}|${t.description}|${t.amount}|${t.direction}`;
      const rows = await this.q(
        `INSERT INTO transactions
           (company_id, direction, amount, occurred_at, description, classification, counts_as_revenue, pf_pj_flag, source, external_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open_finance', $9)
         ON CONFLICT (company_id, external_ref) DO NOTHING
         RETURNING id`,
        [companyId, t.direction, t.amount, t.occurred_at, t.description, t.classification, t.counts_as_revenue, t.pf_pj_flag, ref],
      );
      if (rows.length > 0) inserted++;
    }
    return { inserted };
  }

  async upsertLedger(companyId: string, entries: LedgerEntry[]): Promise<void> {
    for (const e of entries) {
      await this.q(
        `INSERT INTO revenue_ledger (company_id, ref_year, ref_month, revenue_month, revenue_ytd, revenue_12m, limit_reference, usage_pct)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0)
         ON CONFLICT (company_id, ref_year, ref_month)
         DO UPDATE SET revenue_month = EXCLUDED.revenue_month, revenue_ytd = EXCLUDED.revenue_ytd,
                       revenue_12m = EXCLUDED.revenue_12m, updated_at = now()`,
        [companyId, e.ref_year, e.ref_month, e.revenue_month, e.revenue_ytd, e.revenue_12m],
      );
    }
  }

  async getLedger(companyId: string): Promise<LedgerEntry[]> {
    return this.q<LedgerEntry>(
      `SELECT ref_year, ref_month,
              to_char(make_date(ref_year, ref_month, 1), 'YYYY-MM') AS ref_period,
              revenue_month, revenue_ytd, revenue_12m
       FROM revenue_ledger WHERE company_id = $1 ORDER BY ref_year, ref_month`,
      [companyId],
    );
  }

  async recordInvoice(inv: Omit<InvoiceRecord, 'id' | 'created_at'>): Promise<InvoiceRecord> {
    const [row] = await this.q<InvoiceRecord>(
      `INSERT INTO issued_invoices (company_id, ref_period, tipos, valor_total, iss_retido, provider_ref, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [inv.company_id, inv.ref_period, inv.tipos, inv.valor_total, inv.iss_retido, inv.provider_ref, inv.status],
    );
    return row;
  }

  async appendEvent(ev: NewEvent): Promise<{ inserted: boolean; id: string }> {
    const rows = await this.q<{ id: string }>(
      `INSERT INTO domain_events (company_id, event_type, severity, payload, dedupe_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [ev.company_id, ev.event_type, ev.severity, JSON.stringify(ev.payload), ev.dedupe_key],
    );
    if (rows.length > 0) return { inserted: true, id: rows[0].id };
    const [existing] = await this.q<{ id: string }>(
      'SELECT id FROM domain_events WHERE dedupe_key = $1',
      [ev.dedupe_key],
    );
    return { inserted: false, id: existing.id };
  }

  async fetchUnpublishedEvents(limit: number): Promise<EventRecord[]> {
    return this.q<EventRecord>(
      'SELECT * FROM domain_events WHERE published_at IS NULL ORDER BY created_at LIMIT $1',
      [limit],
    );
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.q('UPDATE domain_events SET published_at = now() WHERE id = ANY($1)', [ids]);
  }

  async close(): Promise<void> {
    const pool = await this.poolPromise;
    await pool.end();
  }
}
