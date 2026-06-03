/**
 * Régua de cobrança / dunning (spec §12).
 *
 * Lógica pura: dada uma cobrança (valor, vencimento, status, etapa atual) e a
 * data de hoje, decide qual a PRÓXIMA etapa da régua a disparar e o evento de
 * domínio correspondente — sem reprocessar etapas já enviadas (idempotência via
 * `dunning_step`). A escada de cobrança é config de produto (não tributária).
 */
import { DomainEvent, DomainEventType, Severity } from './detectors.js';

export type ChargeStatus = 'open' | 'paid' | 'overdue' | 'canceled';

export interface ChargeView {
  amount: number;
  due_date: string;     // 'YYYY-MM-DD'
  status: ChargeStatus;
  dunning_step: number; // última etapa já disparada (0 = nenhuma)
}

export interface DunningRung {
  step: number;
  offset_days: number;  // dias relativos ao vencimento (negativo = antes)
  event_type: DomainEventType;
  severity: Severity;
}

/** Escada padrão: lembrete antes, e escalonamento após o vencimento. */
export const DEFAULT_DUNNING_LADDER: DunningRung[] = [
  { step: 1, offset_days: -3, event_type: 'charge.reminder', severity: 'info' },
  { step: 2, offset_days: 1, event_type: 'charge.overdue', severity: 'warning' },
  { step: 3, offset_days: 7, event_type: 'charge.overdue', severity: 'warning' },
  { step: 4, offset_days: 15, event_type: 'charge.overdue', severity: 'critical' },
];

export interface DunningDecision {
  advance_to: number | null;   // nova etapa a registrar (null = nada a fazer)
  event: DomainEvent | null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Avalia a régua para uma cobrança. Retorna a maior etapa cujo gatilho já
 * passou e que ainda não foi disparada; ignora cobranças pagas/canceladas.
 */
export function avaliarRegua(
  charge: ChargeView,
  today: Date,
  ladder: DunningRung[] = DEFAULT_DUNNING_LADDER,
): DunningDecision {
  if (charge.status === 'paid' || charge.status === 'canceled') return { advance_to: null, event: null };

  const due = new Date(charge.due_date);
  const diasAposVenc = daysBetween(due, today); // <0 antes do vencimento

  // Maior degrau elegível: gatilho já alcançado e etapa ainda não enviada.
  let chosen: DunningRung | null = null;
  for (const rung of ladder) {
    if (rung.step > charge.dunning_step && diasAposVenc >= rung.offset_days) {
      if (!chosen || rung.step > chosen.step) chosen = rung;
    }
  }
  if (!chosen) return { advance_to: null, event: null };

  return {
    advance_to: chosen.step,
    event: {
      event_type: chosen.event_type,
      severity: chosen.severity,
      payload: {
        amount: charge.amount,
        due_date: charge.due_date,
        step: chosen.step,
        dias_atraso: diasAposVenc > 0 ? diasAposVenc : 0,
        dias_para_vencer: diasAposVenc < 0 ? -diasAposVenc : 0,
      },
    },
  };
}
