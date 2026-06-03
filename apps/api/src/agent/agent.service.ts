/**
 * Agente Central de IA — loop de tool-calling (spec §6.2).
 *
 *   pergunta → system prompt + tools → Claude decide responder OU chamar tool(s)
 *   → backend executa tool, devolve resultado → Claude formula resposta final.
 *
 * Usa a API Anthropic com prompt caching: o system prompt + o catálogo de tools
 * (estáveis entre turnos) ficam num breakpoint de cache, reduzindo custo/latência.
 */
import Anthropic from '@anthropic-ai/sdk';
import { claudeTools, toolSchemas } from '../tools/registry.js';
import { callTool } from '../tools/impl.js';
import { buildPromptContext, renderSystemPrompt } from './system-prompt.js';

// Default no modelo mais capaz e atual; sobreponível por env.
const MODEL = process.env.COPILOTO_AGENT_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOOL_ROUNDS = 5;

export interface AgentResult {
  reply: string;
  tool_calls: { name: string; input: unknown; output: unknown }[];
}

const actionTools = new Set(toolSchemas.filter((t) => t.is_action).map((t) => t.name));

export class AgentService {
  private client: Anthropic | null;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  async ask(companyId: string, userMessage: string): Promise<AgentResult> {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY não configurada — o Agente IA está indisponível.');
    }

    const ctx = buildPromptContext(companyId);
    const system = renderSystemPrompt(ctx);
    const toolCalls: AgentResult['tool_calls'] = [];

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        // Prompt caching: system + tools são estáveis → breakpoint ephemeral.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: claudeTools().map((t, i, arr) =>
          i === arr.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t,
        ),
        messages,
      });

      if (res.stop_reason !== 'tool_use') {
        const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
        return { reply: text.trim(), tool_calls: toolCalls };
      }

      // Executa as tools solicitadas e devolve os resultados ao modelo.
      messages.push({ role: 'assistant', content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        let output: unknown;
        try {
          // Tools de ação não são executadas sem confirmação: devolvem um preview.
          if (actionTools.has(block.name)) {
            output = { ...(callTool(block.name, block.input as Record<string, unknown>) as object), _note: 'AÇÃO pendente de confirmação do usuário.' };
          } else {
            output = callTool(block.name, block.input as Record<string, unknown>);
          }
        } catch (err) {
          output = { error: (err as Error).message };
        }
        toolCalls.push({ name: block.name, input: block.input, output });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { reply: 'Precisei de muitos passos para responder. Pode reformular?', tool_calls: toolCalls };
  }
}
