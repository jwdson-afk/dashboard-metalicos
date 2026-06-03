/**
 * @copiloto/tax-engine — lógica tributária pura e testável (spec §17.2 packages/tax-engine).
 *
 * Regra de ouro (§19): nenhum valor tributário é hardcoded; tudo resolve via tax_rules.
 */
export * from './tax-rules.js';
export * from './money.js';
export * from './das-mei.js';
export * from './das-simples.js';
export * from './limits.js';
export * from './penalty.js';
export * from './reform.js';
export * from './calendar.js';
export * from './detectors.js';
export * from './nota-fiscal.js';
export * from './classify.js';
export * from './ledger.js';

import { TaxRules } from './tax-rules.js';
import seed2026 from '../data/tax_rules_2026.json' with { type: 'json' };

/** Carrega o seed 2026 embutido (conveniência para CLI/web; em prod, vem do banco). */
export function taxRules2026(): TaxRules {
  return TaxRules.fromSeed(seed2026 as unknown as { rules: any[] });
}
