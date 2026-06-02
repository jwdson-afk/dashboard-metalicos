import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { RuleNotFoundError } from '../src/tax-rules.js';

// "Agente sem dado": NUNCA inventa — falha explícita quando a regra não existe (§6.5 ex.4, §19).
test('Regra ausente lança RuleNotFoundError (não inventa valor)', () => {
  const rules = taxRules2026();
  assert.throws(() => rules.numeric('iss.municipal.aliquota_especifica', 2026), RuleNotFoundError);
});

test('Ano sem vigência também falha (versionamento por ano)', () => {
  const rules = taxRules2026();
  assert.throws(() => rules.numeric('mei.das.inss', 2099), RuleNotFoundError);
});

test('Faixas do Simples vêm ordenadas e completas (6 faixas por anexo)', () => {
  const rules = taxRules2026();
  for (const anexo of ['I', 'II', 'III', 'IV', 'V']) {
    const faixas = rules.faixasSimples(anexo, 2026);
    assert.equal(faixas.length, 6, `Anexo ${anexo} deve ter 6 faixas`);
    assert.equal(faixas[0].de, 0);
  }
});
