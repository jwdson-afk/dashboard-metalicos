import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.COPILOTO_FAKE_NOW = '2026-06-17T12:00:00Z';
const { MemoryRepository } = await import('../src/repo/memory.js');
const { setRepository } = await import('../src/repo/index.js');
const { callTool } = await import('../src/tools/impl.js');

const CID = 'demo-company';
const fresh = () => {
  const repo = new MemoryRepository();
  setRepository(repo);
  return repo;
};

const novaNota = {
  company_id: CID,
  tomador: { is_pj: true, documento: '12345678000190', nome: 'Loja Bella Decor' },
  itens: [{ natureza: 'servico', descricao: 'Consultoria', valor: 1000 }],
};

test('modo assistido (default): issue_invoice apenas prevê, sem emitir', async () => {
  fresh();
  const r = (await callTool('issue_invoice', novaNota)) as any;
  assert.equal(r.executed, false);
  assert.equal(r.requires_confirmation, true);
  assert.equal(r.valor_total, 1000); // cálculo mostrado mesmo no preview
});

test('confirm: true executa a emissão', async () => {
  fresh();
  const r = (await callTool('issue_invoice', { ...novaNota, confirm: true })) as any;
  assert.equal(r.executed, true);
  assert.ok(r.provider_ref);
});

test('modo autônomo emite sem confirmação', async () => {
  const repo = fresh();
  await repo.setAutomationPolicy(CID, { issue_invoice: 'autonomous' });
  const r = (await callTool('issue_invoice', novaNota)) as any;
  assert.equal(r.executed, true);
});

test('create_charge assistido não persiste; confirmado persiste', async () => {
  fresh();
  const preview = (await callTool('create_charge', { company_id: CID, amount: 750 })) as any;
  assert.equal(preview.executed, false);
  let list = (await callTool('list_charges', { company_id: CID, status: 'open' })) as any;
  assert.ok(!list.charges.some((c: any) => c.amount === 750));

  const done = (await callTool('create_charge', { company_id: CID, amount: 750, confirm: true })) as any;
  assert.equal(done.executed, true);
  list = (await callTool('list_charges', { company_id: CID, status: 'open' })) as any;
  assert.ok(list.charges.some((c: any) => c.amount === 750));
});

test('recommend_regime (MEI demo, projeção estoura, B2B alto) → simples_hibrido', async () => {
  fresh();
  const a = (await callTool('recommend_regime', { company_id: CID })) as any;
  assert.equal(a.recommendation, 'simples_hibrido');
  assert.equal(a.prazo_opcao_2027, '2026-09-30');
});

test('get/set_automation faz roundtrip', async () => {
  fresh();
  const before = (await callTool('get_automation', { company_id: CID })) as any;
  assert.equal(before.create_charge, 'assisted');
  const after = (await callTool('set_automation', { company_id: CID, policy: { create_charge: 'autonomous' } })) as any;
  assert.equal(after.create_charge, 'autonomous');
});
