/**
 * Detectores de monitoramento proativo (spec §9.1).
 *
 * Funções puras: recebem o estado atual e retornam os eventos de domínio
 * (§14.1) que devem ser emitidos. O backend captura os eventos, gera alertas
 * humanizados via Agente e despacha pelos canais.
 *
 * Subconjunto implementado nesta fase (os mais críticos do MVP):
 *   limit.threshold_50/80/95 · limit.projected_overflow
 *   obligation.due_soon · obligation.overdue · dasn.due_soon
 */
import { TaxRules } from './tax-rules.js';
import { LimitStatus } from './limits.js';

export type DomainEventType =
  | 'limit.threshold_50'
  | 'limit.threshold_80'
  | 'limit.threshold_95'
  | 'limit.projected_overflow'
  | 'obligation.due_soon'
  | 'obligation.overdue'
  | 'dasn.due_soon';

export type Severity = 'info' | 'warning' | 'critical';

export interface DomainEvent {
  event_type: DomainEventType;
  severity: Severity;
  payload: Record<string, unknown>;
}

export interface ObligationView {
  kind: string;        // das_mei | das_simples | dasn | ...
  ref_period: string;
  due_date: string;    // 'YYYY-MM-DD'
  status: string;      // pending | generated | paid | overdue
  amount?: number | null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Detectores de limite a partir do status já classificado (§9.1, §9.2). */
export function detectarLimite(status: LimitStatus): DomainEvent[] {
  const base = { usage_pct: status.usage_pct, revenue_12m: status.revenue_12m, limit: status.limit };
  switch (status.threshold) {
    case 'info_50':
      return [{ event_type: 'limit.threshold_50', severity: 'info', payload: base }];
    case 'warning_80':
      return [{ event_type: 'limit.threshold_80', severity: 'warning', payload: base }];
    case 'critical_95':
      return [{ event_type: 'limit.threshold_95', severity: 'critical', payload: base }];
    case 'overflow':
      return [{ event_type: 'limit.projected_overflow', severity: 'critical', payload: base }];
    default:
      return [];
  }
}

/**
 * Detectores de obrigações (§9.1):
 *  - DAS a vencer: due_date − hoje ≤ 5 dias e status pendente → warning
 *  - DAS vencido: due_date < hoje e status ≠ paid → critical
 *  - DASN próxima: dentro de 30 dias do prazo → warning
 */
export function detectarObrigacoes(
  obligations: ObligationView[],
  today: Date,
  _rules?: TaxRules,
): DomainEvent[] {
  const events: DomainEvent[] = [];
  for (const o of obligations) {
    if (o.status === 'paid') continue;
    const due = new Date(o.due_date);
    const dias = daysBetween(today, due); // >0 = faltam dias; <0 = vencido

    if (dias < 0) {
      events.push({
        event_type: 'obligation.overdue',
        severity: 'critical',
        payload: { kind: o.kind, ref_period: o.ref_period, due_date: o.due_date, dias_atraso: -dias },
      });
      continue;
    }

    if (o.kind === 'dasn') {
      if (dias <= 30) {
        events.push({
          event_type: 'dasn.due_soon',
          severity: 'warning',
          payload: { ref_period: o.ref_period, due_date: o.due_date, dias_restantes: dias },
        });
      }
      continue;
    }

    if (dias <= 5) {
      events.push({
        event_type: 'obligation.due_soon',
        severity: 'warning',
        payload: { kind: o.kind, ref_period: o.ref_period, due_date: o.due_date, dias_restantes: dias, amount: o.amount ?? null },
      });
    }
  }
  return events;
}
