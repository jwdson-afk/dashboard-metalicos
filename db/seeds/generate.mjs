#!/usr/bin/env node
// Gera tax_rules_2026.sql a partir do JSON canônico do tax-engine (única fonte da verdade).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(here, '..', '..', 'packages', 'tax-engine', 'data', 'tax_rules_2026.json'), 'utf8'),
);

const sql = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v == null ? 'NULL' : Number(v));
const jsonb = (v) => (v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);

const lines = [
  '-- Seed tax_rules 2026 — GERADO de packages/tax-engine/data/tax_rules_2026.json.',
  '-- NÃO editar à mão: rode `node db/seeds/generate.mjs`. (spec §5.2, §20)',
  '',
];
for (const r of seed.rules) {
  lines.push(
    'INSERT INTO tax_rules (rule_key, year_valid, valid_from, valid_until, value_numeric, value_text, metadata, source_url) VALUES',
    `  (${sql(r.rule_key)}, ${num(r.year_valid)}, ${sql(r.valid_from)}, ${sql(r.valid_until)}, ${num(r.value_numeric)}, ${sql(r.value_text)}, ${jsonb(r.metadata)}, ${sql(r.source_url)})`,
    '  ON CONFLICT (rule_key, year_valid) DO UPDATE SET',
    '    value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,',
    '    metadata = EXCLUDED.metadata, valid_from = EXCLUDED.valid_from;',
    '',
  );
}

writeFileSync(join(here, 'tax_rules_2026.sql'), lines.join('\n'));
console.log(`✅ tax_rules_2026.sql gerado com ${seed.rules.length} regras.`);
