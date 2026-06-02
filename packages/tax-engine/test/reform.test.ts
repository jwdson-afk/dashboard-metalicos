import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { explicarReforma, repartirIbsCbs } from '../src/reform.js';

test('Reforma MEI — mensagem de regime preservado + alíquotas de teste', () => {
  const r = explicarReforma({ regime: 'mei', vende_b2b: false, ref_period: '2026-06' }, taxRules2026());
  assert.match(r.base, /MEI foi preservado/);
  assert.deepEqual(r.aliquotas_teste, { cbs: 0.009, ibs: 0.001 });
});

test('Reforma ME B2B — sugere Simples Híbrido e traz prazo de opção', () => {
  const r = explicarReforma({ regime: 'simples_me', vende_b2b: true, ref_period: '2026-06' }, taxRules2026());
  assert.match(r.base, /Simples Híbrido/);
  assert.equal(r.prazo_opcao_2027, '2026-09-30');
});

test('Repartição IBS/CBS de teste (2026) sobre a receita do mês', () => {
  const r = repartirIbsCbs(10000, '2026-06', taxRules2026());
  assert.equal(r.cbs, 90.0); // 0,9%
  assert.equal(r.ibs, 10.0); // 0,1%
});
