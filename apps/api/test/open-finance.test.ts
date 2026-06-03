import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../src/repo/memory.js';
import { runBankSync } from '../src/jobs/sync-bank.js';
import { StubBankProvider } from '../src/bank/provider.js';
import { dispatchPending } from '../src/alerts/dispatcher.js';
import { InMemoryChannel } from '../src/alerts/channel.js';

const NOW = new Date('2026-06-30T12:00:00Z');

test('bank-sync classifica extrato, insere transações e materializa o ledger', async () => {
  const repo = new MemoryRepository();
  const r = await runBankSync(repo, NOW, new StubBankProvider());
  assert.equal(r.companies, 1);
  assert.equal(r.transactions_inserted, 6); // todas do stub
  assert.ok(r.ledger_months >= 1);
  assert.equal(r.mixing_events, 1); // o gasto "Netflix" na conta PJ

  const ledger = await repo.getLedger('demo-company');
  // junho/2026 deve conter as receitas reconhecidas (pedido PJ + maquininha).
  const jun = ledger.find((e) => e.ref_period === '2026-06');
  assert.ok(jun && jun.revenue_month >= 5050); // 3200 + 1850
});

test('bank-sync é idempotente (mesmo extrato não duplica)', async () => {
  const repo = new MemoryRepository();
  await runBankSync(repo, NOW, new StubBankProvider());
  const again = await runBankSync(repo, NOW, new StubBankProvider());
  assert.equal(again.transactions_inserted, 0);
  assert.equal(again.mixing_events, 0); // dedupe por mês
});

test('o evento de mistura PF/PJ é humanizado e despachado', async () => {
  const repo = new MemoryRepository();
  await runBankSync(repo, NOW, new StubBankProvider());
  const ch = new InMemoryChannel();
  await dispatchPending(repo, [ch]);
  const alerta = ch.sent.find((m) => /pessoal misturado/.test(m.title));
  assert.ok(alerta, 'esperava alerta de mistura PF/PJ');
  assert.match(alerta!.body, /risco fiscal/);
});

test('get_cashflow resume entradas, saídas e mistura', async () => {
  process.env.COPILOTO_FAKE_NOW = NOW.toISOString();
  const repo = new MemoryRepository();
  await runBankSync(repo, NOW, new StubBankProvider());
  const { setRepository } = await import('../src/repo/index.js');
  setRepository(repo);
  const { callTool } = await import('../src/tools/impl.js');
  const cf = (await callTool('get_cashflow', { company_id: 'demo-company' })) as any;
  assert.equal(cf.entradas, 5550); // 3200 + 1850 + 500
  assert.ok(cf.mistura_pf_pj.count === 1);
});
