/**
 * Automação progressiva (spec §6.5, §18 Fase 5).
 *
 * Cada AÇÃO sensível tem um nível de autonomia por empresa:
 *   manual      → só o usuário executa (o Agente nem propõe automaticamente)
 *   assisted    → o Agente propõe; executa apenas após confirmação (default)
 *   autonomous  → o Agente executa sozinho e informa depois
 *
 * O produto começa conservador (assisted) e o usuário libera autonomia conforme
 * ganha confiança — sem nunca tirar do humano as decisões de alto risco.
 */
export type AutonomyLevel = 'manual' | 'assisted' | 'autonomous';

export type AutomatedAction = 'generate_das_guia' | 'issue_invoice' | 'create_charge' | 'dunning';

export type AutomationPolicy = Record<AutomatedAction, AutonomyLevel>;

export const DEFAULT_POLICY: AutomationPolicy = {
  generate_das_guia: 'assisted',
  issue_invoice: 'assisted',
  create_charge: 'assisted',
  dunning: 'autonomous', // a régua de lembretes roda sozinha por padrão
};

/** Decide se a ação deve ser executada agora, dado o nível e a confirmação. */
export function shouldExecute(level: AutonomyLevel, confirmed: boolean): boolean {
  if (level === 'autonomous') return true;
  if (level === 'manual') return confirmed; // só com confirmação explícita do humano
  return confirmed; // assisted: idem, mas o Agente pode propor
}
