import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.COPILOTO_FAKE_NOW = '2026-06-17T12:00:00Z';
const { callTool } = await import('../src/tools/impl.js');

const CID = 'demo-company';

test('get_company_status traz regime, % do teto e próximo vencimento', async () => {
  const s = (await callTool('get_company_status', { company_id: CID })) as any;
  assert.equal(s.regime, 'mei');
  assert.equal(s.revenue_12m, 68040);
  assert.equal(s.limit, 81000);
  assert.equal(s.usage_pct, 84.0);
  assert.equal(s.threshold, 'warning_80');
  assert.equal(s.next_due.kind, 'das_mei');
});

test('calculate_das_mei (atividade mista) = R$ 87,05', async () => {
  const r = (await callTool('calculate_das_mei', { company_id: CID, ref_period: '2026-06' })) as any;
  assert.equal(r.valor, 87.05);
  assert.ok(r.rule_version.includes('mei.das.inss@2026'));
});

test('check_limit_projection calcula margem e meses até o teto', async () => {
  const p = (await callTool('check_limit_projection', { company_id: CID })) as any;
  assert.equal(p.margem_ate_teto, 12960); // 81000 - 68040
  assert.equal(p.media_mensal, 5670);
  assert.equal(p.meses_ate_estouro, 2); // floor(12960 / 5670)
});

test('explain_reform_impact (MEI) menciona regime preservado', async () => {
  const r = (await callTool('explain_reform_impact', { company_id: CID })) as any;
  assert.match(r.base, /MEI foi preservado/);
});

test('simulate_migration compara MEI vs Simples Anexo III', async () => {
  const m = (await callTool('simulate_migration', { company_id: CID })) as any;
  assert.equal(m.atual_mei.das_mensal, 87.05);
  assert.ok(m.simulado_me_anexo_III.das_mensal_estimado > 0);
});

test('generate_das_guia (AÇÃO) devolve preview com pix e exige confirmação', async () => {
  const g = (await callTool('generate_das_guia', { company_id: CID, ref_period: '2026-06' })) as any;
  assert.equal(g.requires_confirmation, true);
  assert.equal(g.amount, 87.05);
  assert.ok(g.pix_copia_cola.length > 0);
});

test('validate_invoice aprova nota válida e reprova inválida', async () => {
  const ok = (await callTool('validate_invoice', {
    company_id: CID,
    tomador: { is_pj: true, documento: '12345678000190', nome: 'Loja Bella Decor' },
    itens: [{ natureza: 'servico', descricao: 'Peça artesanal', valor: 1000 }],
  })) as any;
  assert.equal(ok.ok, true);

  const bad = (await callTool('validate_invoice', {
    company_id: CID,
    tomador: { is_pj: true, documento: '123', nome: '' },
    itens: [{ natureza: 'servico', descricao: '', valor: 0 }],
  })) as any;
  assert.equal(bad.ok, false);
  assert.ok(bad.erros.length >= 3);
});

test('issue_invoice (AÇÃO) calcula ISS retido + Reforma e emite via provedor quando confirmado', async () => {
  const args = {
    company_id: CID,
    tomador: { is_pj: true, documento: '12345678000190', nome: 'Loja Bella Decor' },
    itens: [{ natureza: 'servico', descricao: 'Consultoria', valor: 1000, servico_sujeito_retencao_iss: true }],
  };
  // Modo assistido: apenas prevê, com o cálculo completo.
  const preview = (await callTool('issue_invoice', args)) as any;
  assert.equal(preview.executed, false);
  assert.equal(preview.requires_confirmation, true);
  assert.deepEqual(preview.tipos, ['nfse']);
  assert.equal(preview.iss_retido, 50);
  assert.equal(preview.reforma.cbs, 9);

  // Confirmado: emite via provedor.
  const nf = (await callTool('issue_invoice', { ...args, confirm: true })) as any;
  assert.equal(nf.executed, true);
  assert.equal(nf.provider, 'stub');
  assert.ok(nf.provider_ref.startsWith('DEMO-NF-'));
});

test('tool desconhecida lança erro', async () => {
  await assert.rejects(() => callTool('inexistente', { company_id: CID }) as Promise<unknown>);
});
