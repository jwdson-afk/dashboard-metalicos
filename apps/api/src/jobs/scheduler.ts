/**
 * Agendador simples (spec §4 jobs). Roda a varredura diária + o despacho do
 * outbox num intervalo configurável (default 1h). Em produção, troque por um
 * cron real (ex.: pg_cron, BullMQ) — a lógica de cada ciclo é `runCycle`.
 */
import type { Repository } from '../repo/types.js';
import { runDailyScan, type ScanResult } from './daily-scan.js';
import { dispatchPending, type DispatchResult } from '../alerts/dispatcher.js';

export interface CycleResult {
  scan: ScanResult;
  dispatch: DispatchResult;
}

export async function runCycle(repo: Repository, now = new Date()): Promise<CycleResult> {
  const scan = await runDailyScan(repo, now);
  const dispatch = await dispatchPending(repo);
  return { scan, dispatch };
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private repo: Repository,
    private intervalMs = Number(process.env.SCAN_INTERVAL_MS ?? 60 * 60 * 1000),
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = () => {
      runCycle(this.repo).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[scheduler] ciclo falhou:', (err as Error).message);
      });
    };
    tick(); // executa imediatamente no boot
    this.timer = setInterval(tick, this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
