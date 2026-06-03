/**
 * Job da régua de cobrança (spec §12).
 *
 * Varre as cobranças abertas/vencidas, aplica a régua (tax-engine), avança a
 * etapa (`dunning_step`) e emite no outbox o evento da etapa — com dedupe por
 * (cobrança, etapa), garantindo que cada degrau dispare uma única vez.
 */
import { avaliarRegua } from '@copiloto/tax-engine';
import type { Repository } from '../repo/types.js';

export interface DunningResult {
  charges_evaluated: number;
  steps_advanced: number;
  events_emitted: number;
}

export async function runDunning(repo: Repository, now: Date): Promise<DunningResult> {
  const charges = await repo.listOpenChargesAll();
  let advanced = 0;
  let emitted = 0;

  for (const c of charges) {
    const decision = avaliarRegua(
      { amount: c.amount, due_date: c.due_date, status: c.status, dunning_step: c.dunning_step },
      now,
    );
    if (decision.advance_to == null || !decision.event) continue;

    // Marca vencida ao ultrapassar o vencimento, e avança a etapa.
    const overdue = decision.event.event_type === 'charge.overdue';
    await repo.updateCharge(c.company_id, c.id, {
      dunning_step: decision.advance_to,
      ...(overdue ? { status: 'overdue' as const } : {}),
    });
    advanced++;

    const { inserted } = await repo.appendEvent({
      company_id: c.company_id,
      event_type: decision.event.event_type,
      severity: decision.event.severity,
      payload: { ...decision.event.payload, charge_id: c.id, customer_name: c.customer_name },
      dedupe_key: `${c.company_id}:charge:${c.id}:step:${decision.advance_to}`,
    });
    if (inserted) emitted++;
  }

  return { charges_evaluated: charges.length, steps_advanced: advanced, events_emitted: emitted };
}
