#!/usr/bin/env node
/**
 * Critério de aceite da spec (§19, "Observações finais #4"):
 * "nenhum valor tributário pode vir hardcoded; todos devem resolver via tax_rules.
 *  Teste que tenta encontrar número fixo no código de cálculo deve falhar o lint/CI."
 *
 * Este guard varre os arquivos de cálculo e falha se encontrar literais que
 * coincidem com valores tributários oficiais (que só podem vir de tax_rules).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

// Valores tributários que NUNCA podem aparecer literais no código de cálculo.
const FORBIDDEN = [
  '81.05', '81000', '40500', '360000', '4800000',
  '0.0033', '0.009', '0.001', '1621',
  '0.06', '0.112', '0.04', '0.073', // alíquotas de faixa
];

// Arquivos puramente de cálculo (a camada tax-rules e money podem citar nada disso).
const CALC_FILES = ['das-mei.ts', 'das-simples.ts', 'limits.ts', 'penalty.ts', 'reform.ts'];

let violations = [];
for (const file of readdirSync(srcDir)) {
  if (!CALC_FILES.includes(file)) continue;
  const text = readFileSync(join(srcDir, file), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // Ignora comentários (onde citamos valores apenas para documentar o caso de aceite).
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    for (const needle of FORBIDDEN) {
      // \b não funciona bem com ponto decimal; usamos limites manuais.
      const re = new RegExp(`(^|[^\\d.])${needle.replace('.', '\\.')}([^\\d]|$)`);
      if (re.test(code)) {
        violations.push(`${file}:${i + 1}  valor tributário hardcoded: ${needle}`);
      }
    }
  });
}

if (violations.length) {
  console.error('❌ Valores tributários hardcoded encontrados (devem vir de tax_rules):');
  for (const v of violations) console.error('   ' + v);
  process.exit(1);
}
console.log('✅ Nenhum valor tributário hardcoded nos arquivos de cálculo.');
