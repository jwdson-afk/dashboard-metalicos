import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { recomendarRegime, type RegimeAdvisorInput } from '../src/regime-advisor.js';
import { detectarPrazoReforma } from '../src/detectors.js';

const base = (over: Partial<RegimeAdvisorInput> = {}): RegimeAdvisorInput => ({
  regime: 'mei', revenue_12m: 68040, b2b_share: 0.5, ref_period: '2026-06', ...over,
});

test('MEI dentro do teto → manter_mei (urgência baixa)', () => {
  const a = recomendarRegime(base({ revenue_12m: 50000, projected_revenue_12m: 60000 }), taxRules2026());
  assert.equal(a.recommendation, 'manter_mei');
  assert.equal(a.urgency, 'baixa');
});

test('MEI projetado a estourar + B2B alto → simples_hibrido (urgência média)', () => {
  const a = recomendarRegime(base({ revenue_12m: 78000, projected_revenue_12m: 90000, b2b_share: 0.6 }), taxRules2026());
  assert.equal(a.recommendation, 'simples_hibrido');
  assert.equal(a.urgency, 'media');
  assert.ok(a.alternativas.includes('migrar_me'));
});

test('MEI já acima do teto + B2B baixo → migrar_me (urgência alta)', () => {
  const a = recomendarRegime(base({ revenue_12m: 95000, b2b_share: 0.1 }), taxRules2026());
  assert.equal(a.recommendation, 'migrar_me');
  assert.equal(a.urgency, 'alta');
});

test('ME com muita venda B2B → simples_hibrido', () => {
  const a = recomendarRegime(base({ regime: 'simples_me', revenue_12m: 400000, b2b_share: 0.7 }), taxRules2026());
  assert.equal(a.recommendation, 'simples_hibrido');
});

test('ME majoritariamente B2C → simples_comum', () => {
  const a = recomendarRegime(base({ regime: 'simples_me', revenue_12m: 400000, b2b_share: 0.05 }), taxRules2026());
  assert.equal(a.recommendation, 'simples_comum');
});

test('recomendação carrega prazo de tax_rules e rule_version', () => {
  const a = recomendarRegime(base(), taxRules2026());
  assert.equal(a.prazo_opcao_2027, '2026-09-30');
  assert.ok(a.rule_version.some((k) => k.startsWith('reforma.prazo_opcao_2027')));
});

test('detector de prazo: ≤60 dias e indeciso → reform.decision_due_soon', () => {
  const ev = detectarPrazoReforma({ prazo_opcao: '2026-09-30', aplicavel: true, ja_decidiu: false }, new Date('2026-08-15'));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].event_type, 'reform.decision_due_soon');
  assert.equal(ev[0].payload.dias_restantes, 46);
});

test('detector de prazo: já decidiu ou não aplicável → silêncio', () => {
  assert.equal(detectarPrazoReforma({ prazo_opcao: '2026-09-30', aplicavel: true, ja_decidiu: true }, new Date('2026-08-15')).length, 0);
  assert.equal(detectarPrazoReforma({ prazo_opcao: '2026-09-30', aplicavel: false, ja_decidiu: false }, new Date('2026-08-15')).length, 0);
});
