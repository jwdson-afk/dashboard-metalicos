/**
 * API do Copiloto MEI & ME (spec §4 camada de API).
 * Endpoints REST que expõem o tax-engine, o calendário fiscal, os detectores
 * e o Agente IA. Persistência em memória nesta fase (repo trocável por Postgres).
 */
import Fastify from 'fastify';
import { receita12m, classificarLimite, gerarObrigacoes, detectarLimite, detectarObrigacoes, taxRules2026 } from '@copiloto/tax-engine';
import { repo } from './repo/memory.js';
import { callTool } from './tools/impl.js';
import { toolSchemas } from './tools/registry.js';
import { AgentService } from './agent/agent.service.js';
import { buildPromptContext, renderSystemPrompt } from './agent/system-prompt.js';

export function buildServer() {
  const app = Fastify({ logger: false });
  const agent = new AgentService();
  const now = () => new Date(process.env.COPILOTO_FAKE_NOW ?? new Date().toISOString());

  app.get('/health', async () => ({ ok: true, agent_available: agent.available }));

  // Situação consolidada da empresa.
  app.get('/companies/:id/status', async (req) => {
    const { id } = req.params as { id: string };
    return callTool('get_company_status', { company_id: id });
  });

  // Obrigações (com filtro opcional ?status=).
  app.get('/companies/:id/obligations', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.query as { status?: string };
    return callTool('list_obligations', { company_id: id, status });
  });

  // Roda os detectores agora e retorna os eventos disparados (§9).
  app.get('/companies/:id/detectors', async (req) => {
    const { id } = req.params as { id: string };
    const c = repo.getCompany(id);
    const rev12 = receita12m(repo.getTransactions(id), now());
    const status = classificarLimite(
      { regime: c.regime, revenue_12m: rev12, opening_date: c.opening_date, ano: now().getUTCFullYear() },
      taxRules2026(),
    );
    const events = [
      ...detectarLimite(status),
      ...detectarObrigacoes(repo.getObligations(id).map((o) => ({ ...o })), now()),
    ];
    return { events };
  });

  // Calendário fiscal — obrigações que deveriam existir hoje (§7.4).
  app.get('/companies/:id/calendar', async (req) => {
    const { id } = req.params as { id: string };
    const c = repo.getCompany(id);
    return { planned: gerarObrigacoes({ regime: c.regime, opening_date: c.opening_date }, now(), taxRules2026()) };
  });

  // Catálogo de tools + system prompt (inspeção/depuração).
  app.get('/companies/:id/agent/prompt', async (req) => {
    const { id } = req.params as { id: string };
    const ctx = buildPromptContext(id);
    return { system_prompt: renderSystemPrompt(ctx), tools: toolSchemas };
  });

  // Conversa com o Agente.
  app.post('/companies/:id/agent/message', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { message } = req.body as { message?: string };
    if (!message) return reply.code(400).send({ error: 'campo "message" obrigatório' });
    if (!agent.available) {
      return reply.code(503).send({ error: 'Agente indisponível: configure ANTHROPIC_API_KEY.' });
    }
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
      return callTool(tool, { company_id: id, ...body });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  return app;
}

// Entry point.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`Copiloto API ouvindo em http://localhost:${port}`);
  });
}
