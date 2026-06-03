import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTransaction, classifyMany } from '../src/classify.js';
import { detectarMistura } from '../src/detectors.js';

const tx = (over: Partial<Parameters<typeof classifyTransaction>[0]> = {}) => ({
  description: '', direction: 'inflow' as const, amount: 100, occurred_at: '2026-06-10', ...over,
});

test('entrada de contraparte PJ → pj_revenue (conta no teto)', () => {
  const r = classifyTransaction(tx({ description: 'Pagamento pedido', counterparty_is_pj: true }));
  assert.equal(r.classification, 'pj_revenue');
  assert.equal(r.counts_as_revenue, true);
  assert.equal(r.pf_pj_flag, 'pj');
});

test('venda por descrição (PF consumidor com palavra de venda) → pj_revenue', () => {
  const r = classifyTransaction(tx({ description: 'Venda na maquininha', counterparty_document: '12345678909' }));
  assert.equal(r.classification, 'pj_revenue');
  assert.equal(r.counts_as_revenue, true);
});

test('pagamento de DAS → tax_payment, não conta como receita', () => {
  const r = classifyTransaction(tx({ description: 'DAS Simples Nacional', direction: 'outflow', amount: 87.05 }));
  assert.equal(r.classification, 'tax_payment');
  assert.equal(r.counts_as_revenue, false);
  assert.equal(r.pf_pj_flag, 'pj');
});

test('gasto pessoal saindo da conta PJ → pf_personal + mixed_alert', () => {
  const r = classifyTransaction(tx({ description: 'Netflix assinatura', direction: 'outflow', amount: 55 }));
  assert.equal(r.classification, 'pf_personal');
  assert.equal(r.pf_pj_flag, 'mixed_alert');
  assert.ok(r.reasons.some((x) => /mistura PF\/PJ/.test(x)));
});

test('entrada de PF sem indício de venda → ambíguo (não conta)', () => {
  const r = classifyTransaction(tx({ description: 'Transferência recebida', counterparty_document: '12345678909' }));
  assert.equal(r.classification, 'ambiguous');
  assert.equal(r.counts_as_revenue, false);
});

test('saída operacional comum → pj_expense', () => {
  const r = classifyTransaction(tx({ description: 'Compra de insumos', direction: 'outflow', amount: 300, counterparty_is_pj: true }));
  assert.equal(r.classification, 'pj_expense');
  assert.equal(r.counts_as_revenue, false);
});

test('detectarMistura agrega gastos pessoais na conta PJ', () => {
  const classified = classifyMany([
    tx({ description: 'Netflix', direction: 'outflow', amount: 55 }),
    tx({ description: 'Farmacia', direction: 'outflow', amount: 80 }),
    tx({ description: 'Pagamento pedido', counterparty_is_pj: true }),
  ]);
  const ev = detectarMistura(classified);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].event_type, 'finance.mixed_pf_pj');
  assert.equal(ev[0].payload.count, 2);
  assert.equal(ev[0].payload.total, 135);
});
