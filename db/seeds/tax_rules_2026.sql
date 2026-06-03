-- Seed tax_rules 2026 — GERADO de packages/tax-engine/data/tax_rules_2026.json.
-- NÃO editar à mão: rode `node db/seeds/generate.mjs`. (spec §5.2, §20)

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('salario_minimo', 2026, '2026-01-01', NULL, 1621, NULL, NULL, 'https://www.gov.br')
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.limite_anual', 2026, '2026-01-01', NULL, 81000, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.inss', 2026, '2026-01-01', NULL, 81.05, NULL, '{"base":"5% do salário mínimo"}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.iss', 2026, '2026-01-01', NULL, 5, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.icms', 2026, '2026-01-01', NULL, 1, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.inss_caminhoneiro', 2026, '2026-01-01', NULL, 194.52, NULL, '{"base":"12% do salário mínimo"}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.vencimento_dia', 2026, '2026-01-01', NULL, 20, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.multa_diaria_pct', 2026, '2026-01-01', NULL, 0.0033, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('mei.das.multa_teto_pct', 2026, '2026-01-01', NULL, 0.2, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('nanoempreendedor.limite_anual', 2026, '2026-01-01', NULL, 40500, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('me.limite_anual', 2026, '2026-01-01', NULL, 360000, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('epp.limite_anual', 2026, '2026-01-01', NULL, 4800000, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('dasn.prazo', 2026, '2026-01-01', NULL, NULL, '2026-05-31', NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('dasn.multa_minima', 2026, '2026-01-01', NULL, 50, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('dirpf.limite_rendimentos', 2026, '2026-01-01', NULL, 33888, NULL, '{"obs":"regra base 2025; atualizar anualmente"}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('nf.iss.aliquota_retencao_padrao', 2026, '2026-01-01', NULL, 0.05, NULL, '{"obs":"ISS retido na fonte por tomador PJ — varia por município/serviço; default configurável"}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('nf.valor_minimo', 2026, '2026-01-01', NULL, 0.01, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('reforma.cbs.aliquota_teste', 2026, '2026-01-01', NULL, 0.009, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('reforma.ibs.aliquota_teste', 2026, '2026-01-01', NULL, 0.001, NULL, NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('reforma.prazo_opcao_2027', 2026, '2026-01-01', NULL, NULL, '2026-09-30', NULL, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('reforma.cronograma', 2026, '2026-01-01', NULL, NULL, NULL, '{"2026":{"fase":"teste","cbs":0.009,"ibs":0.001,"dentro_do_das":true,"erro_boa_fe_sem_multa":true},"2027":{"fase":"cbs_efetiva","pis_cofins":"extintos","split_payment_b2b":true},"2029_2033":{"fase":"transicao_ibs","obs":"alíquotas sobem gradualmente"}}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('simples.anexo_I', 2026, '2026-01-01', NULL, NULL, NULL, '{"descricao":"Comércio","faixas":[{"faixa":1,"de":0,"ate":180000,"aliquota":0.04,"deducao":0},{"faixa":2,"de":180000.01,"ate":360000,"aliquota":0.073,"deducao":5940},{"faixa":3,"de":360000.01,"ate":720000,"aliquota":0.095,"deducao":13860},{"faixa":4,"de":720000.01,"ate":1800000,"aliquota":0.107,"deducao":22500},{"faixa":5,"de":1800000.01,"ate":3600000,"aliquota":0.143,"deducao":87300},{"faixa":6,"de":3600000.01,"ate":4800000,"aliquota":0.19,"deducao":378000}]}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('simples.anexo_II', 2026, '2026-01-01', NULL, NULL, NULL, '{"descricao":"Indústria","faixas":[{"faixa":1,"de":0,"ate":180000,"aliquota":0.045,"deducao":0},{"faixa":2,"de":180000.01,"ate":360000,"aliquota":0.078,"deducao":5940},{"faixa":3,"de":360000.01,"ate":720000,"aliquota":0.1,"deducao":13860},{"faixa":4,"de":720000.01,"ate":1800000,"aliquota":0.112,"deducao":22500},{"faixa":5,"de":1800000.01,"ate":3600000,"aliquota":0.147,"deducao":85500},{"faixa":6,"de":3600000.01,"ate":4800000,"aliquota":0.3,"deducao":720000}]}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('simples.anexo_III', 2026, '2026-01-01', NULL, NULL, NULL, '{"descricao":"Serviços","faixas":[{"faixa":1,"de":0,"ate":180000,"aliquota":0.06,"deducao":0},{"faixa":2,"de":180000.01,"ate":360000,"aliquota":0.112,"deducao":9360},{"faixa":3,"de":360000.01,"ate":720000,"aliquota":0.135,"deducao":17640},{"faixa":4,"de":720000.01,"ate":1800000,"aliquota":0.16,"deducao":35640},{"faixa":5,"de":1800000.01,"ate":3600000,"aliquota":0.21,"deducao":125640},{"faixa":6,"de":3600000.01,"ate":4800000,"aliquota":0.33,"deducao":648000}]}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('simples.anexo_IV', 2026, '2026-01-01', NULL, NULL, NULL, '{"descricao":"Serviços específicos","faixas":[{"faixa":1,"de":0,"ate":180000,"aliquota":0.045,"deducao":0},{"faixa":2,"de":180000.01,"ate":360000,"aliquota":0.09,"deducao":8100},{"faixa":3,"de":360000.01,"ate":720000,"aliquota":0.102,"deducao":12420},{"faixa":4,"de":720000.01,"ate":1800000,"aliquota":0.14,"deducao":39780},{"faixa":5,"de":1800000.01,"ate":3600000,"aliquota":0.22,"deducao":183780},{"faixa":6,"de":3600000.01,"ate":4800000,"aliquota":0.33,"deducao":828000}]}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;

INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES
  ('simples.anexo_V', 2026, '2026-01-01', NULL, NULL, NULL, '{"descricao":"Serviços de maior valor agregado","faixas":[{"faixa":1,"de":0,"ate":180000,"aliquota":0.155,"deducao":0},{"faixa":2,"de":180000.01,"ate":360000,"aliquota":0.18,"deducao":4500},{"faixa":3,"de":360000.01,"ate":720000,"aliquota":0.195,"deducao":9900},{"faixa":4,"de":720000.01,"ate":1800000,"aliquota":0.205,"deducao":17100},{"faixa":5,"de":1800000.01,"ate":3600000,"aliquota":0.23,"deducao":62100},{"faixa":6,"de":3600000.01,"ate":4800000,"aliquota":0.305,"deducao":540000}]}'::jsonb, NULL)
  ON CONFLICT (rule_key, year_valid) DO UPDATE SET
    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;
