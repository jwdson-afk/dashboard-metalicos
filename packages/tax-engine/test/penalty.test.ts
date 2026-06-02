import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { calcularMulta } from '../src/penalty.js';

test('Multa por atraso — 10 dias = amount × 0,0033 × 10', () => {
  const r = calcularMulta(
    { amount: 86.05, due_date: '2026-03-20', today: new Date('2026-03-30'), year: 2026 },
    taxRules2026(),
  );
  assert.equal(r.dias_atraso, 10);
  // 86,05 × 0,0033 × 10 = 2,84 (arredondado)
  assert.equal(r.multa, 2.84);
});

test('Multa respeita o teto de 20%', () => {
  // 1000 dias de atraso saturaria; deve limitar a 20% do valor.
  const r = calcularMulta(
    { amount: 100, due_date: '2020-01-01', today: new Date('2026-01-01'), year: 2026 },
    taxRules2026(),
  );
  assert.equal(r.multa, 20.0);
});

test('Sem atraso (no prazo) = multa zero', () => {
  const r = calcularMulta(
    { amount: 86.05, due_date: '2026-03-20', today: new Date('2026-03-20'), year: 2026 },
    taxRules2026(),
  );
  assert.equal(r.total, 0);
});

test('Juros aplicam a Selic acumulada injetada', () => {
  const r = calcularMulta(
    { amount: 1000, due_date: '2026-03-20', today: new Date('2026-04-20'), selic_acumulada: 0.01, year: 2026 },
    taxRules2026(),
  );
  assert.equal(r.juros, 10.0);
});
