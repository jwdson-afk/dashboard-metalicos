import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueLedger, revenue12mFromLedger } from '../src/ledger.js';
import { receita12m } from '../src/limits.js';

// 12 meses de R$ 5.670 (jul/25 a jun/26) = 68.040 — espelha a empresa demo.
const txs = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 6 + i, 1));
  return { amount: 5670, occurred_at: d.toISOString().slice(0, 10), counts_as_revenue: true };
});

test('ledger materializa 12 meses com janela móvel coerente', () => {
  const ledger = buildRevenueLedger(txs, '2026-06');
  assert.equal(ledger.length, 12);
  assert.equal(ledger.at(-1)!.ref_period, '2026-06');
  assert.equal(ledger.at(-1)!.revenue_12m, 68040);
  assert.equal(ledger.at(-1)!.revenue_month, 5670);
});

test('revenue_12m do ledger bate com receita12m (limits)', () => {
  const ledger = buildRevenueLedger(txs, '2026-06');
  assert.equal(revenue12mFromLedger(ledger), receita12m(txs, new Date('2026-06-17')));
});

test('YTD acumula só o ano-calendário', () => {
  const ledger = buildRevenueLedger(txs, '2026-06');
  // jan-jun/2026 = 6 × 5.670 = 34.020
  assert.equal(ledger.at(-1)!.revenue_ytd, 34020);
});

test('transações que não contam como receita são ignoradas', () => {
  const mixed = [
    ...txs,
    { amount: 9999, occurred_at: '2026-06-15', counts_as_revenue: false },
  ];
  const ledger = buildRevenueLedger(mixed, '2026-06');
  assert.equal(ledger.at(-1)!.revenue_12m, 68040);
});

test('extrato vazio retorna ledger vazio', () => {
  assert.deepEqual(buildRevenueLedger([]), []);
});
