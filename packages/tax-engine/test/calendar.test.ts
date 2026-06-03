import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { gerarObrigacoes } from '../src/calendar.js';

test('DAS-MEI mensal é gerado com vencimento dia 20', () => {
  const obs = gerarObrigacoes({ regime: 'mei', opening_date: '2023-04-01' }, new Date('2026-06-10'), taxRules2026());
  const das = obs.find((o) => o.kind === 'das_mei');
  assert.ok(das);
  assert.equal(das.ref_period, '2026-06');
  assert.equal(das.due_date, '2026-06-20');
});

test('Em janeiro, MEI também gera DASN do ano anterior', () => {
  const obs = gerarObrigacoes({ regime: 'mei', opening_date: '2023-04-01' }, new Date('2026-01-15'), taxRules2026());
  const dasn = obs.find((o) => o.kind === 'dasn');
  assert.ok(dasn);
  assert.equal(dasn.ref_period, '2025');
  assert.equal(dasn.due_date, '2026-05-31');
});

test('ME gera das_simples, não das_mei nem DASN', () => {
  const obs = gerarObrigacoes({ regime: 'simples_me', opening_date: '2020-01-01' }, new Date('2026-01-15'), taxRules2026());
  assert.ok(obs.some((o) => o.kind === 'das_simples'));
  assert.ok(!obs.some((o) => o.kind === 'das_mei'));
  assert.ok(!obs.some((o) => o.kind === 'dasn'));
});
