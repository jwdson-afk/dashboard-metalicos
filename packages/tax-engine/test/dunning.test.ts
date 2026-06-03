import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRegua, type ChargeView } from '../src/dunning.js';

const charge = (over: Partial<ChargeView> = {}): ChargeView => ({
  amount: 500, due_date: '2026-06-20', status: 'open', dunning_step: 0, ...over,
});

test('3 dias antes do vencimento dispara o lembrete (etapa 1)', () => {
  const d = avaliarRegua(charge(), new Date('2026-06-17'));
  assert.equal(d.advance_to, 1);
  assert.equal(d.event?.event_type, 'charge.reminder');
  assert.equal(d.event?.severity, 'info');
  assert.equal(d.event?.payload.dias_para_vencer, 3);
});

test('não reenvia etapa já disparada', () => {
  const d = avaliarRegua(charge({ dunning_step: 1 }), new Date('2026-06-17'));
  assert.equal(d.advance_to, null);
  assert.equal(d.event, null);
});

test('1 dia após o vencimento escala para etapa 2 (overdue/warning)', () => {
  const d = avaliarRegua(charge({ dunning_step: 1 }), new Date('2026-06-21'));
  assert.equal(d.advance_to, 2);
  assert.equal(d.event?.event_type, 'charge.overdue');
  assert.equal(d.event?.payload.dias_atraso, 1);
});

test('muito atrasada salta direto para a maior etapa elegível (crítica)', () => {
  const d = avaliarRegua(charge({ dunning_step: 0 }), new Date('2026-07-10')); // +20 dias
  assert.equal(d.advance_to, 4);
  assert.equal(d.event?.severity, 'critical');
});

test('cobrança paga não dispara nada', () => {
  const d = avaliarRegua(charge({ status: 'paid' }), new Date('2026-07-10'));
  assert.equal(d.advance_to, null);
  assert.equal(d.event, null);
});
