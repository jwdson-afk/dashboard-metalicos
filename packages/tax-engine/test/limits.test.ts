import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { receita12m, limiteProporcional, classificarLimite } from '../src/limits.js';

test('Limite proporcional — abertura em junho = teto/12 × 7', () => {
  const limite = limiteProporcional('mei', '2026-06-15', 2026, taxRules2026());
  // 81.000 / 12 × 7 = 47.250
  assert.equal(limite, 47250.0);
});

test('Limite cheio quando não é o ano de abertura', () => {
  const limite = limiteProporcional('mei', '2024-06-15', 2026, taxRules2026());
  assert.equal(limite, 81000.0);
});

test('Receita 12m soma apenas a janela móvel e o que conta como receita', () => {
  const ref = new Date('2026-06-30');
  const txs = [
    { amount: 5000, occurred_at: '2026-06-01', counts_as_revenue: true },
    { amount: 3000, occurred_at: '2026-01-10', counts_as_revenue: true },
    { amount: 9999, occurred_at: '2025-01-01', counts_as_revenue: true }, // fora da janela
    { amount: 1000, occurred_at: '2026-05-01', counts_as_revenue: false }, // não é receita
  ];
  assert.equal(receita12m(txs, ref), 8000.0);
});

test('Detector limite 80% — receita_12m em 84% do teto dispara warning_80', () => {
  const status = classificarLimite(
    { regime: 'mei', revenue_12m: 0.84 * 81000, opening_date: '2020-01-01', ano: 2026 },
    taxRules2026(),
  );
  assert.equal(status.threshold, 'warning_80');
  assert.equal(status.usage_pct, 84.0);
});

test('Detector limite 95% e overflow', () => {
  const rules = taxRules2026;
  assert.equal(
    classificarLimite({ regime: 'mei', revenue_12m: 0.96 * 81000, opening_date: '2020-01-01', ano: 2026 }, rules()).threshold,
    'critical_95',
  );
  assert.equal(
    classificarLimite({ regime: 'mei', revenue_12m: 90000, opening_date: '2020-01-01', ano: 2026 }, rules()).threshold,
    'overflow',
  );
});
