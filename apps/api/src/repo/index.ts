/**
 * Localizador do repositório ativo. Seleciona PostgreSQL quando `DATABASE_URL`
 * está presente; caso contrário usa memória (dev/demos/testes). A escolha é
 * resolvida de forma preguiçosa e cacheada.
 */
import type { Repository } from './types.js';
import { memoryRepo } from './memory.js';

let active: Repository | null = null;

export function getRepository(): Repository {
  if (active) return active;
  if (process.env.DATABASE_URL) {
    // Import dinâmico para não exigir `pg` quando rodando só em memória/testes.
    throw new Error(
      'DATABASE_URL definido: use `await initPostgresRepository()` no bootstrap para ativar o Postgres.',
    );
  }
  active = memoryRepo;
  return active;
}

/** Permite ao bootstrap (ou testes) injetar uma implementação específica. */
export function setRepository(repo: Repository): void {
  active = repo;
}

/** Ativa o Postgres a partir de DATABASE_URL (chamado no server bootstrap). */
export async function initPostgresRepository(): Promise<Repository> {
  const { PostgresRepository } = await import('./postgres.js');
  active = new PostgresRepository(process.env.DATABASE_URL!);
  return active;
}

export * from './types.js';
