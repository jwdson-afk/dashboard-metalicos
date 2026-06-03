import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.COPILOTO_FAKE_NOW = '2026-06-17T12:00:00Z';
const { buildPromptContext, renderSystemPrompt } = await import('../src/agent/system-prompt.js');
const { AgentService } = await import('../src/agent/agent.service.js');

test('system prompt injeta dados reais da empresa e snapshot de tax_rules', async () => {
  const ctx = await buildPromptContext('demo-company');
  const prompt = renderSystemPrompt(ctx);
  assert.match(prompt, /Marina Souza/);
  assert.match(prompt, /CNPJ 12\.345\.678\/0001-90/);
  assert.match(prompt, /% do teto utilizado: 84/);
  assert.match(prompt, /Limite MEI: R\$ 81\.000/); // veio do snapshot tax_rules, não hardcoded no texto
  assert.match(prompt, /NUNCA invente valores/);   // princípio inegociável §6.4
});

test('AgentService sem ANTHROPIC_API_KEY fica indisponível (não inventa)', () => {
  const svc = new AgentService(undefined);
  assert.equal(svc.available, false);
});

test('AgentService com chave fica disponível', () => {
  const svc = new AgentService('sk-ant-fake');
  assert.equal(svc.available, true);
});
