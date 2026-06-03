/**
 * API do Copiloto MEI & ME (spec §4 camada de API).
 * Expõe o tax-engine, o calendário fiscal, os detectores, o outbox/alertas e o
 * Agente IA. Persistência via {@link Repository}: memória (default) ou Postgres
 * (quando `DATABASE_URL` está presente). O agendador roda a varredura + alertas.
 */
import Fastify from 'fastify';
import { receita12m, classificarLimite, gerarObrigacoes, detectarLimite, detectarObrigacoes, taxRules2026 } from '@copiloto/tax-engine';
import { getRepository, setRepository, initPostgresRepository } from './repo/index.js';
import { callTool } from './tools/impl.js';
import { toolSchemas } from './tools/registry.js';
import { AgentService } from './agent/agent.service.js';
import { buildPromptContext, renderSystemPrompt } from './agent/system-prompt.js';
import { runCycle } from './jobs/scheduler.js';
import { runBankSync } from './jobs/sync-bank.js';
import { runDunning } from './jobs/dunning.js';
import { dispatchPending } from './alerts/dispatcher.js';

export function buildServer() {
  const app = Fastify({ logger: false });
  const agent = new AgentService();
  const now = () => new Date(process.env.COPILOTO_FAKE_NOW ?? new Date().toISOString());
  const repo = () => getRepository();

  app.get('/health', async () => ({ ok: true, agent_available: agent.available }));

  app.get('/companies/:id/status', async (req) => {
    const { id } = req.params as { id: string };
    return callTool('get_company_status', { company_id: id });
  });

  app.get('/companies/:id/obligations', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.query as { status?: string };
    return callTool('list_obligations', { company_id: id, status });
  });

  // Roda os detectores agora e retorna os eventos disparados (§9).
  app.get('/companies/:id/detectors', async (req) => {
    const { id } = req.params as { id: string };
    const c = await repo().getCompany(id);
    const rev12 = receita12m(await repo().getTransactions(id), now());
    const status = classificarLimite(
      { regime: c.regime, revenue_12m: rev12, opening_date: c.opening_date, ano: now().getUTCFullYear() },
      taxRules2026(),
    );
    const obligations = (await repo().getObligations(id)).map((o) => ({ ...o }));
    return { events: [...detectarLimite(status), ...detectarObrigacoes(obligations, now())] };
  });

  // Calendário fiscal — obrigações que deveriam existir hoje (§7.4).
  app.get('/companies/:id/calendar', async (req) => {
    const { id } = req.params as { id: string };
    const c = await repo().getCompany(id);
    return { planned: gerarObrigacoes({ regime: c.regime, opening_date: c.opening_date }, now(), taxRules2026()) };
  });

  // Catálogo de tools + system prompt (inspeção/depuração).
  app.get('/companies/:id/agent/prompt', async (req) => {
    const { id } = req.params as { id: string };
    const ctx = await buildPromptContext(id);
    return { system_prompt: renderSystemPrompt(ctx), tools: toolSchemas };
  });

  app.post('/companies/:id/agent/message', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { message } = req.body as { message?: string };
    if (!message) return reply.code(400).send({ error: 'campo "message" obrigatório' });
    if (!agent.available) return reply.code(503).send({ error: 'Agente indisponível: configure ANTHROPIC_API_KEY.' });
    try {
      return await agent.ask(id, message);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // Execução direta de uma tool (para o frontend acionar ações confirmadas).
  app.post('/companies/:id/tools/:tool', async (req, reply) => {
    const { id, tool } = req.params as { id: string; tool: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      return await callTool(tool, { company_id: id, ...body });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Dispara um ciclo do agendador sob demanda (varredura + despacho de alertas).
  app.post('/jobs/run-cycle', async () => runCycle(repo(), now()));

  // Despacha apenas o outbox pendente.
  app.post('/jobs/dispatch', async () => dispatchPending(repo()));

  // Sincroniza o Open Finance (extrato → classificação → ledger → eventos).
  app.post('/jobs/bank-sync', async () => runBankSync(repo(), now()));

  // Roda a régua de cobrança (§12): avança etapas e emite eventos no outbox.
  app.post('/jobs/dunning', async () => runDunning(repo(), now()));

  // Cobranças da empresa.
  app.get('/companies/:id/charges', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.query as { status?: string };
    return callTool('list_charges', { company_id: id, status });
  });

  // Ledger de receita materializado (§5.3).
  app.get('/companies/:id/ledger', async (req) => {
    const { id } = req.params as { id: string };
    return { ledger: await repo().getLedger(id) };
  });

  return app;
}

// Bootstrap: ativa Postgres se houver DATABASE_URL, inicia o agendador e ouve.
async function bootstrap() {
  if (process.env.DATABASE_URL) {
    setRepository(await initPostgresRepository());
  }
  const { Scheduler } = await import('./jobs/scheduler.js');
  const scheduler = new Scheduler(getRepository());
  if (process.env.SCHEDULER_ENABLED !== 'false') scheduler.start();

  const app = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`Copiloto API ouvindo em http://localhost:${port}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha no bootstrap:', err);
    process.exit(1);
  });
}
