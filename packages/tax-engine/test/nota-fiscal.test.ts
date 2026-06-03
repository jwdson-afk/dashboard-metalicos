import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRules2026 } from '../src/index.js';
import { determinarTipo, validarEmissao, montarNota, type EmitirNotaContext } from '../src/nota-fiscal.js';

const baseCtx = (over: Partial<EmitirNotaContext> = {}): EmitirNotaContext => ({
  regime: 'mei',
  is_iss_contributor: true,
  ref_period: '2026-06',
  tomador: { is_pj: true, documento: '12345678000190', nome: 'Loja Bella Decor' },
  itens: [{ natureza: 'servico', descricao: 'Peça artesanal sob encomenda', valor: 1000 }],
  ...over,
});

test('determinarTipo: serviço → NFS-e, produto → NF-e', () => {
  assert.equal(determinarTipo('servico'), 'nfse');
  assert.equal(determinarTipo('produto'), 'nfe');
});

test('nota mista gera os dois tipos', () => {
  const nota = montarNota(
    baseCtx({
      itens: [
        { natureza: 'servico', descricao: 'Mão de obra', valor: 300 },
        { natureza: 'produto', descricao: 'Material', valor: 200 },
      ],
    }),
    taxRules2026(),
  );
  assert.deepEqual(nota.tipos.sort(), ['nfe', 'nfse']);
  assert.equal(nota.valor_total, 500);
});

test('validação rejeita CNPJ inválido, descrição vazia e valor zero', () => {
  const v = validarEmissao(
    baseCtx({
      tomador: { is_pj: true, documento: '123', nome: '' },
      itens: [{ natureza: 'servico', descricao: '  ', valor: 0 }],
    }),
    taxRules2026(),
  );
  assert.equal(v.ok, false);
  assert.equal(v.erros.length, 4); // doc, nome, descrição, valor
});

test('ISS retido = 5% quando tomador PJ e serviço sujeito a retenção', () => {
  const nota = montarNota(
    baseCtx({ itens: [{ natureza: 'servico', descricao: 'Consultoria', valor: 1000, servico_sujeito_retencao_iss: true }] }),
    taxRules2026(),
  );
  assert.equal(nota.iss_retido, 50); // 1000 × 0,05
});

test('sem flag de retenção, ISS retido é zero', () => {
  const nota = montarNota(baseCtx(), taxRules2026());
  assert.equal(nota.iss_retido, 0);
});

test('campos da Reforma preenchidos: CBS 0,9% e IBS 0,1% sobre o total', () => {
  const nota = montarNota(baseCtx({ itens: [{ natureza: 'produto', descricao: 'Item', valor: 1000 }] }), taxRules2026());
  assert.equal(nota.reforma.cbs, 9);
  assert.equal(nota.reforma.ibs, 1);
});

test('MEI: emissão obrigatória p/ tomador PJ, dispensada p/ consumidor PF', () => {
  const pj = montarNota(baseCtx(), taxRules2026());
  assert.equal(pj.obrigatoria, true);

  const pf = montarNota(
    baseCtx({ tomador: { is_pj: false, documento: '12345678909', nome: 'Consumidor' } }),
    taxRules2026(),
  );
  assert.equal(pf.obrigatoria, false);
});

test('montarNota lança quando a validação falha', () => {
  assert.throws(() => montarNota(baseCtx({ itens: [] }), taxRules2026()), /Nota inválida/);
});
