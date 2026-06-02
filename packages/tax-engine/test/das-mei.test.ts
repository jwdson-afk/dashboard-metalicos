import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { calcularDasMei } from '../src/das-mei.js';

// Casos de aceite obrigatórios — spec §19.
test('DAS-MEI serviços 2026 = R$ 86,05', () => {
  const r = calcularDasMei(
    { activity_type: 'servicos', is_iss_contributor: true, is_icms_contributor: false },
    '2026-03',
    taxRules2026(),
  );
  assert.equal(r.valor, 86.05);
  assert.equal(r.composicao.inss, 81.05);
  assert.equal(r.composicao.iss, 5.0);
  assert.equal(r.composicao.icms, 0);
});

test('DAS-MEI comércio 2026 = R$ 82,05', () => {
  const r = calcularDasMei(
    { activity_type: 'comercio', is_iss_contributor: false, is_icms_contributor: true },
    '2026-03',
    taxRules2026(),
  );
  assert.equal(r.valor, 82.05);
});

test('DAS-MEI misto 2026 (ISS + ICMS) = R$ 87,05', () => {
  const r = calcularDasMei(
    { activity_type: 'misto', is_iss_contributor: true, is_icms_contributor: true },
    '2026-03',
    taxRules2026(),
  );
  assert.equal(r.valor, 87.05);
});

test('DAS-MEI caminhoneiro usa INSS de 12% do salário mínimo', () => {
  const r = calcularDasMei(
    { activity_type: 'caminhoneiro', is_iss_contributor: false, is_icms_contributor: true },
    '2026-03',
    taxRules2026(),
  );
  // 194,52 (INSS 12%) + 1,00 (ICMS) = 195,52
  assert.equal(r.valor, 195.52);
});

test('rule_version rastreia as chaves tax_rules usadas (audit_log)', () => {
  const r = calcularDasMei(
    { activity_type: 'servicos', is_iss_contributor: true, is_icms_contributor: false },
    '2026-03',
    taxRules2026(),
  );
  assert.ok(r.rule_version.includes('mei.das.inss@2026'));
  assert.ok(r.rule_version.includes('mei.das.iss@2026'));
});
