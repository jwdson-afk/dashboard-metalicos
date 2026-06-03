import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { classificarLimite } from '../src/limits.js';
import { detectarLimite, detectarObrigacoes } from '../src/detectors.js';

test('Detector limite 80% emite limit.threshold_80 (warning)', () => {
  const status = classificarLimite(
    { regime: 'mei', revenue_12m: 0.84 * 81000, opening_date: '2020-01-01', ano: 2026 },
    taxRules2026(),
  );
  const ev = detectarLimite(status);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].event_type, 'limit.threshold_80');
  assert.equal(ev[0].severity, 'warning');
});

test('Abaixo de 50% não emite evento de limite', () => {
  const status = classificarLimite(
    { regime: 'mei', revenue_12m: 0.3 * 81000, opening_date: '2020-01-01', ano: 2026 },
    taxRules2026(),
  );
  assert.equal(detectarLimite(status).length, 0);
});

test('DAS a vencer em ≤5 dias dispara obligation.due_soon', () => {
  const ev = detectarObrigacoes(
    [{ kind: 'das_mei', ref_period: '2026-06', due_date: '2026-06-20', status: 'pending', amount: 87.05 }],
    new Date('2026-06-17'),
  );
  assert.equal(ev[0].event_type, 'obligation.due_soon');
  assert.equal(ev[0].payload.dias_restantes, 3);
});

test('DAS vencido dispara obligation.overdue (critical)', () => {
  const ev = detectarObrigacoes(
    [{ kind: 'das_mei', ref_period: '2026-05', due_date: '2026-05-20', status: 'pending' }],
    new Date('2026-05-30'),
  );
  assert.equal(ev[0].event_type, 'obligation.overdue');
  assert.equal(ev[0].severity, 'critical');
  assert.equal(ev[0].payload.dias_atraso, 10);
});

test('Obrigação paga não gera evento', () => {
  const ev = detectarObrigacoes(
    [{ kind: 'das_mei', ref_period: '2026-05', due_date: '2026-05-20', status: 'paid' }],
    new Date('2026-05-30'),
  );
  assert.equal(ev.length, 0);
});

test('DASN dentro de 30 dias do prazo dispara dasn.due_soon', () => {
  const ev = detectarObrigacoes(
    [{ kind: 'dasn', ref_period: '2025', due_date: '2026-05-31', status: 'pending' }],
    new Date('2026-05-10'),
  );
  assert.equal(ev[0].event_type, 'dasn.due_soon');
  assert.equal(ev[0].payload.dias_restantes, 21);
});
