/**
 * Contrato de persistência (spec §5). O resto do sistema só conhece esta
 * interface assíncrona — a implementação pode ser memória (dev/testes) ou
 * PostgreSQL (produção). Inclui o outbox transacional de eventos (§14.2).
 */
import type { ActivityType, Regime, ClassifiedTx, LedgerEntry } from '@copiloto/tax-engine';

export interface CompanyRecord {
  id: string;
  legal_name: string;
  trade_name: string;
  cnpj: string;
  regime: Regime;
  activity_type: ActivityType;
  simples_anexo?: 'I' | 'II' | 'III' | 'IV' | 'V';
  opening_date: string;
  municipality: string;
  state_uf: string;
  is_iss_contributor: boolean;
  is_icms_contributor: boolean;
  owner_full_name: string;
}

export interface TransactionRecord {
  amount: number;
  occurred_at: string;
  counts_as_revenue: boolean;
  description?: string;
  direction?: 'inflow' | 'outflow';
  classification?: string;
  pf_pj_flag?: string;
  external_ref?: string;
}

export type ObligationStatus = 'pending' | 'generated' | 'paid' | 'overdue';

export interface ObligationRecord {
  kind: string;
  ref_period: string;
  due_date: string;
  amount: number | null;
  status: ObligationStatus;
}

export interface CustomerRecord {
  name: string;
  is_pj: boolean;
  total_purchased: number;
}

export interface InvoiceRecord {
  id: string;
  company_id: string;
  ref_period: string;
  tipos: string[];
  valor_total: number;
  iss_retido: number;
  provider_ref: string;
  status: 'issued' | 'failed';
  created_at: string;
}

/** Evento de domínio persistido no outbox (§14.1, §14.2). */
export interface EventRecord {
  id: string;
  company_id: string;
  event_type: string;
  severity: string;
  payload: Record<string, unknown>;
  dedupe_key: string;       // evita reemissão do mesmo alerta
  published_at: string | null;
  created_at: string;
}

export interface NewEvent {
  company_id: string;
  event_type: string;
  severity: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
}

export interface Repository {
  // Leitura de domínio
  listCompanies(): Promise<CompanyRecord[]>;
  getCompany(id: string): Promise<CompanyRecord>;
  getTransactions(id: string): Promise<TransactionRecord[]>;
  getObligations(id: string, status?: string): Promise<ObligationRecord[]>;
  getCustomers(id: string): Promise<CustomerRecord[]>;
  vendeB2B(id: string): Promise<boolean>;

  // Escrita idempotente (calendário fiscal §7.4 — UNIQUE company/kind/ref_period)
  upsertObligation(companyId: string, ob: ObligationRecord): Promise<{ created: boolean }>;
  recordInvoice(inv: Omit<InvoiceRecord, 'id' | 'created_at'>): Promise<InvoiceRecord>;

  // Open Finance (§11) — extrato classificado + ledger de receita (§5.3)
  saveClassifiedTransactions(companyId: string, txs: ClassifiedTx[]): Promise<{ inserted: number }>;
  upsertLedger(companyId: string, entries: LedgerEntry[]): Promise<void>;
  getLedger(companyId: string): Promise<LedgerEntry[]>;

  // Outbox de eventos (§14.2)
  appendEvent(ev: NewEvent): Promise<{ inserted: boolean; id: string }>;
  fetchUnpublishedEvents(limit: number): Promise<EventRecord[]>;
  markPublished(ids: string[]): Promise<void>;

  close?(): Promise<void>;
}
