/**
 * Repositório em memória para o MVP/demos (substituível por PostgreSQL).
 * Os dados espelham as tabelas da spec §5 (companies, transactions, tax_obligations).
 */
import type { ActivityType } from '@copiloto/tax-engine';
import type { Regime } from '@copiloto/tax-engine';

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
}

export interface ObligationRecord {
  kind: string;
  ref_period: string;
  due_date: string;
  amount: number | null;
  status: 'pending' | 'generated' | 'paid' | 'overdue';
}

export interface CustomerRecord {
  name: string;
  is_pj: boolean;
  total_purchased: number;
}

const company: CompanyRecord = {
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
    txs.push({
      amount: 5670,
      occurred_at: d.toISOString().slice(0, 10),
      counts_as_revenue: true,
    });
  }
  return txs; // 12 × 5.670 = 68.040
}

const transactions = buildTransactions();

const obligations: ObligationRecord[] = [
  { kind: 'das_mei', ref_period: '2026-06', due_date: '2026-06-20', amount: 87.05, status: 'pending' },
  { kind: 'das_mei', ref_period: '2026-05', due_date: '2026-05-20', amount: 87.05, status: 'paid' },
  { kind: 'dasn', ref_period: '2025', due_date: '2026-05-31', amount: null, status: 'paid' },
];

const customers: CustomerRecord[] = [
  { name: 'Loja Bella Decor', is_pj: true, total_purchased: 28400 },
  { name: 'Ateliê Criativo', is_pj: true, total_purchased: 12100 },
  { name: 'Consumidor final', is_pj: false, total_purchased: 27540 },
];

export const repo = {
  getCompany(id: string): CompanyRecord {
    if (id !== company.id) throw new Error(`Empresa não encontrada: ${id}`);
    return company;
  },
  getTransactions(_id: string): TransactionRecord[] {
    return transactions;
  },
  getObligations(_id: string, status?: string): ObligationRecord[] {
    return status ? obligations.filter((o) => o.status === status) : obligations;
  },
  getCustomers(_id: string): CustomerRecord[] {
    return customers;
  },
  vendeB2B(id: string): boolean {
    return this.getCustomers(id).some((c) => c.is_pj && c.total_purchased > 0);
  },
};
