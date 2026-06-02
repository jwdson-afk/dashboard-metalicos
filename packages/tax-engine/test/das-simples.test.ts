import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { calcularDasSimples } from '../src/das-simples.js';

// Alíquota efetiva — fórmula oficial exata (spec §7.2, §19).
test('Anexo III faixa 2 — alíquota efetiva pela fórmula oficial', () => {
  // RBT12 = 300.000 está na faixa 2 do Anexo III (aliq 11,2% / dedução 9.360).
  // efetiva = (300000 × 0,112 − 9360) / 300000 = 0,0808 = 8,08%
  const r = calcularDasSimples(
    { anexo: 'III', rbt12: 300000, receita_mes: 25000, ref_period: '2026-06' },
    taxRules2026(),
  );
  assert.equal(r.faixa, 2);
  assert.ok(Math.abs(r.aliquota_efetiva - 0.0808) < 1e-9);
  // DAS = 25.000 × 0,0808 = 2.020,00
  assert.equal(r.das, 2020.0);
});

test('Anexo I faixa 1 — efetiva igual à nominal quando dedução = 0', () => {
  const r = calcularDasSimples(
    { anexo: 'I', rbt12: 120000, receita_mes: 10000, ref_period: '2026-06' },
    taxRules2026(),
  );
  assert.equal(r.faixa, 1);
  assert.equal(r.aliquota_efetiva, 0.04);
  assert.equal(r.das, 400.0);
});

test('RBT12 acima do teto EPP lança erro (desenquadramento)', () => {
  assert.throws(() =>
    calcularDasSimples(
      { anexo: 'III', rbt12: 5000000, receita_mes: 10000, ref_period: '2026-06' },
      taxRules2026(),
    ),
  );
});
