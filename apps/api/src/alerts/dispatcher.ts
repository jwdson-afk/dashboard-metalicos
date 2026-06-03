/**
 * Despachante do outbox (spec §14.2). Lê eventos não publicados, humaniza e
 * entrega pelos canais ativos; marca como publicado só após o envio (at-least-once).
 */
import type { Repository } from '../repo/types.js';
import { humanize } from './humanize.js';
import { getChannels, type AlertChannel } from './channel.js';

export interface DispatchResult {
  delivered: number;
  failed: number;
}

export async function dispatchPending(
  repo: Repository,
  channels: AlertChannel[] = getChannels(),
  batch = 50,
): Promise<DispatchResult> {
  const events = await repo.fetchUnpublishedEvents(batch);
  const publishedIds: string[] = [];
  let failed = 0;

  for (const ev of events) {
    const msg = humanize(ev);
    try {
      await Promise.all(channels.map((ch) => ch.send(msg)));
      publishedIds.push(ev.id);
    } catch {
      // Mantém não publicado para nova tentativa no próximo ciclo.
      failed++;
    }
  }

  await repo.markPublished(publishedIds);
  return { delivered: publishedIds.length, failed };
}
