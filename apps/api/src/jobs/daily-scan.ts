/**
 * Job de varredura diária (spec §7.4 calendário + §9 detectores).
 *
 * Para cada empresa:
 *   1. gera as obrigações que deveriam existir hoje (idempotente — UNIQUE
 *      company/kind/ref_period), e
 *   2. roda os detectores e grava os eventos no outbox (dedupe por chave),
 *      para o despachante humanizar e alertar.
 *
 * É puro em relação ao tempo: recebe `now` (testável com clock fixo).
 */
import {
  taxRules2026,
  receita12m,
  classificarLimite,
  gerarObrigacoes,
  detectarLimite,
  detectarObrigacoes,
  type DomainEvent,
} from '@copiloto/tax-engine';
import type { Repository, ObligationRecord } from '../repo/types.js';

export interface ScanResult {
  companies: number;
  obligations_created: number;
  events_emitted: number;
}

/** Chave de dedupe estável: mesmo alerta não é reemitido (§14.2). */
function dedupeKey(companyId: string, ev: DomainEvent, refDay: string): string {
  const p = ev.payload as Record<string, unknown>;
  // Eventos de obrigação deduplicam por obrigação; de limite, por dia.
  const scope = p.ref_period ? `${p.kind ?? 'dasn'}:${p.ref_period}` : refDay;
  return `${companyId}:${ev.event_type}:${scope}`;
}

export async function runDailyScan(repo: Repository, now: Date): Promise<ScanResult> {
  const rules = taxRules2026();
  const refDay = now.toISOString().slice(0, 10);
  const companies = await repo.listCompanies();
  let created = 0;
  let emitted = 0;

  for (const c of companies) {
    // 1) Calendário fiscal → upsert idempotente.
    const planned = gerarObrigacoes({ regime: c.regime, opening_date: c.opening_date }, now, rules);
    for (const p of planned) {
      const ob: ObligationRecord = { kind: p.kind, ref_period: p.ref_period, due_date: p.due_date, amount: null, status: 'pending' };
      const { created: didCreate } = await repo.upsertObligation(c.id, ob);
      if (didCreate) created++;
    }

    // 2) Detectores → outbox.
    const rev12 = receita12m(await repo.getTransactions(c.id), now);
    const status = classificarLimite(
      { regime: c.regime, revenue_12m: rev12, opening_date: c.opening_date, ano: now.getUTCFullYear() },
      rules,
    );
    const obligations = (await repo.getObligations(c.id)).map((o) => ({ ...o }));
    const events: DomainEvent[] = [...detectarLimite(status), ...detectarObrigacoes(obligations, now)];

    for (const ev of events) {
      const { inserted } = await repo.appendEvent({
        company_id: c.id,
        event_type: ev.event_type,
        severity: ev.severity,
        payload: ev.payload as Record<string, unknown>,
        dedupe_key: dedupeKey(c.id, ev, refDay),
      });
      if (inserted) emitted++;
    }
  }

  return { companies: companies.length, obligations_created: created, events_emitted: emitted };
}
