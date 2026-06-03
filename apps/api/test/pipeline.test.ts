import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../src/repo/memory.js';
import { runDailyScan } from '../src/jobs/daily-scan.js';
import { runCycle } from '../src/jobs/scheduler.js';
import { dispatchPending } from '../src/alerts/dispatcher.js';
import { InMemoryChannel } from '../src/alerts/channel.js';
import { humanize } from '../src/alerts/humanize.js';

const NOW = new Date('2026-06-17T12:00:00Z');

test('daily-scan gera obrigações idempotentes e emite eventos no outbox', async () => {
  const repo = new MemoryRepository(); // demo: MEI a 84% do teto, DAS 2026-06 a vencer
  const first = await runDailyScan(repo, NOW);
  assert.equal(first.companies, 1);
  assert.ok(first.events_emitted >= 2); // limit.threshold_80 + obligation.due_soon

  // Segunda varredura no mesmo dia: nada novo (idempotência + dedupe).
  const second = await runDailyScan(repo, NOW);
  assert.equal(second.obligations_created, 0);
  assert.equal(second.events_emitted, 0);
});

test('dispatcher humaniza e entrega; marca como publicado (não reenvia)', async () => {
  const repo = new MemoryRepository();
  await runDailyScan(repo, NOW);

  const ch = new InMemoryChannel();
  const r1 = await dispatchPending(repo, [ch]);
  assert.ok(r1.delivered >= 2);
  assert.equal(ch.sent.length, r1.delivered);
  assert.ok(ch.sent.every((m) => m.title && m.body));

  // Nada pendente no segundo despacho.
  const r2 = await dispatchPending(repo, [ch]);
  assert.equal(r2.delivered, 0);
});

test('runCycle encadeia varredura + despacho', async () => {
  const repo = new MemoryRepository();
  const { scan, dispatch } = await runCycle(repo, NOW);
  assert.ok(scan.events_emitted >= 2);
  assert.equal(dispatch.delivered, scan.events_emitted);
});

test('humanize produz mensagem PT-BR para DAS a vencer', () => {
  const msg = humanize({
    id: 'x', company_id: 'c', event_type: 'obligation.due_soon', severity: 'warning',
    payload: { kind: 'das_mei', ref_period: '2026-06', due_date: '2026-06-20', dias_restantes: 3, amount: 87.05 },
    dedupe_key: 'k', published_at: null, created_at: '',
  });
  assert.match(msg.title, /DAS perto de vencer/);
  assert.match(msg.body, /vence em 3 dia/);
});

test('canal que falha mantém evento não publicado para retry', async () => {
  const repo = new MemoryRepository();
  await runDailyScan(repo, NOW);
  const failing = { name: 'boom', async send() { throw new Error('rede'); } };
  const r = await dispatchPending(repo, [failing]);
  assert.equal(r.delivered, 0);
  assert.ok(r.failed >= 2);

  // Com canal bom depois, ainda há pendências para entregar.
  const ch = new InMemoryChannel();
  const r2 = await dispatchPending(repo, [ch]);
  assert.ok(r2.delivered >= 2);
});
