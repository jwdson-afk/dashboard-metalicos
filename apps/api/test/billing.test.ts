import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../src/repo/memory.js';
import { runDunning } from '../src/jobs/dunning.js';
import { dispatchPending } from '../src/alerts/dispatcher.js';
import { InMemoryChannel } from '../src/alerts/channel.js';
import { StubPaymentGateway } from '../src/billing/gateway.js';

test('régua avança a cobrança vencida e emite evento (idempotente por etapa)', async () => {
  const repo = new MemoryRepository(); // seed tem charge vencida em 2026-06-10
  const now = new Date('2026-06-21T12:00:00Z'); // +11 dias do vencimento

  const r1 = await runDunning(repo, now);
  assert.equal(r1.charges_evaluated, 1);
  assert.equal(r1.steps_advanced, 1);
  assert.equal(r1.events_emitted, 1);

  const [charge] = await repo.listCharges('demo-company');
  assert.equal(charge.status, 'overdue');
  assert.equal(charge.dunning_step, 3); // +11 dias → degrau de 7 dias

  // Reexecução no mesmo dia: nada novo (dedupe por etapa).
  const r2 = await runDunning(repo, now);
  assert.equal(r2.steps_advanced, 0);
  assert.equal(r2.events_emitted, 0);
});

test('evento de cobrança vencida é humanizado e despachado', async () => {
  const repo = new MemoryRepository();
  await runDunning(repo, new Date('2026-06-21T12:00:00Z'));
  const ch = new InMemoryChannel();
  await dispatchPending(repo, [ch]);
  const alerta = ch.sent.find((m) => /Cobrança/.test(m.title));
  assert.ok(alerta, 'esperava alerta de cobrança');
  assert.match(alerta!.body, /atraso/);
});

test('gateway stub cria Pix com copia-e-cola e boleto com URL', async () => {
  const gw = new StubPaymentGateway();
  const pix = await gw.createCharge({ company_cnpj: '12.345.678/0001-90', amount: 500, method: 'pix', due_date: '2026-07-01' });
  assert.ok(pix.pix_copia_cola && pix.pix_copia_cola.length > 0);
  assert.equal(pix.boleto_url, null);

  const boleto = await gw.createCharge({ company_cnpj: '12.345.678/0001-90', amount: 500, method: 'boleto', due_date: '2026-07-01' });
  assert.ok(boleto.boleto_url && boleto.boleto_url.endsWith('.pdf'));
  assert.equal(boleto.pix_copia_cola, null);
});

test('create_charge (AÇÃO) cria e persiste cobrança', async () => {
  process.env.COPILOTO_FAKE_NOW = '2026-06-17T12:00:00Z';
  const repo = new MemoryRepository();
  const { setRepository } = await import('../src/repo/index.js');
  setRepository(repo);
  const { callTool } = await import('../src/tools/impl.js');

  const created = (await callTool('create_charge', {
    company_id: 'demo-company', amount: 750, method: 'pix', customer_name: 'Ateliê Criativo',
  })) as any;
  assert.equal(created.requires_confirmation, true);
  assert.ok(created.pix_copia_cola);

  const list = (await callTool('list_charges', { company_id: 'demo-company', status: 'open' })) as any;
  assert.ok(list.charges.some((c: any) => c.amount === 750));
});
