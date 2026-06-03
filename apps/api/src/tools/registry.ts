/**
 * Esquema das ferramentas expostas ao Agente (spec §6.3), no formato tool-calling
 * da API Claude. Tools de AÇÃO exigem confirmação do usuário no MVP (`is_action`).
 */
export interface ToolSchema {
  name: string;
  description: string;
  is_action: boolean;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const companyId = { type: 'string', description: 'ID da empresa' };

export const toolSchemas: ToolSchema[] = [
  {
    name: 'get_company_status',
    description: 'Situação atual da empresa: regime, faturamento 12m, % do teto, obrigações pendentes e próximo vencimento.',
    is_action: false,
    input_schema: { type: 'object', properties: { company_id: companyId }, required: ['company_id'] },
  },
  {
    name: 'calculate_das_mei',
    description: 'Calcula o valor do DAS-MEI e sua composição (INSS, ICMS, ISS) para um período.',
    is_action: false,
    input_schema: {
      type: 'object',
      properties: { company_id: companyId, ref_period: { type: 'string', description: "Período 'YYYY-MM' (default: mês atual)" } },
      required: ['company_id'],
    },
  },
  {
    name: 'calculate_das_simples',
    description: 'Calcula o DAS do Simples Nacional (ME/EPP): alíquota efetiva e valor, pela fórmula oficial.',
    is_action: false,
    input_schema: {
      type: 'object',
      properties: { company_id: companyId, ref_period: { type: 'string' } },
      required: ['company_id'],
    },
  },
  {
    name: 'check_limit_projection',
    description: 'Projeta quando a empresa estoura o teto do regime, com base na média de faturamento.',
    is_action: false,
    input_schema: { type: 'object', properties: { company_id: companyId }, required: ['company_id'] },
  },
  {
    name: 'explain_reform_impact',
    description: 'Explica o impacto específico da Reforma Tributária para a empresa (regime, B2B, prazos).',
    is_action: false,
    input_schema: { type: 'object', properties: { company_id: companyId }, required: ['company_id'] },
  },
  {
    name: 'list_obligations',
    description: 'Lista obrigações fiscais da empresa, opcionalmente filtrando por status.',
    is_action: false,
    input_schema: {
      type: 'object',
      properties: { company_id: companyId, status: { type: 'string', enum: ['pending', 'generated', 'paid', 'overdue'] } },
      required: ['company_id'],
    },
  },
  {
    name: 'simulate_migration',
    description: 'Compara a carga tributária atual (MEI) com a estimada como Microempresa (Simples).',
    is_action: false,
    input_schema: {
      type: 'object',
      properties: { company_id: companyId, target_regime: { type: 'string', enum: ['simples_me'] } },
      required: ['company_id'],
    },
  },
  {
    name: 'validate_invoice',
    description: 'Valida os dados de uma nota fiscal antes de emitir (tomador, itens, valores). Não emite nada.',
    is_action: false,
    input_schema: {
      type: 'object',
      properties: {
        company_id: companyId,
        ref_period: { type: 'string' },
        tomador: {
          type: 'object',
          properties: {
            is_pj: { type: 'boolean' },
            documento: { type: 'string', description: 'CPF ou CNPJ (apenas dígitos)' },
            nome: { type: 'string' },
          },
          required: ['is_pj', 'documento', 'nome'],
        },
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              natureza: { type: 'string', enum: ['servico', 'produto'] },
              descricao: { type: 'string' },
              valor: { type: 'number' },
              servico_sujeito_retencao_iss: { type: 'boolean' },
            },
            required: ['natureza', 'descricao', 'valor'],
          },
        },
      },
      required: ['company_id', 'tomador', 'itens'],
    },
  },
  {
    name: 'issue_invoice',
    description: 'AÇÃO: emite a nota fiscal (NFS-e/NF-e) com retenção de ISS e campos da Reforma. Requer confirmação do usuário.',
    is_action: true,
    input_schema: {
      type: 'object',
      properties: {
        company_id: companyId,
        ref_period: { type: 'string' },
        tomador: {
          type: 'object',
          properties: {
            is_pj: { type: 'boolean' },
            documento: { type: 'string' },
            nome: { type: 'string' },
          },
          required: ['is_pj', 'documento', 'nome'],
        },
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              natureza: { type: 'string', enum: ['servico', 'produto'] },
              descricao: { type: 'string' },
              valor: { type: 'number' },
              servico_sujeito_retencao_iss: { type: 'boolean' },
            },
            required: ['natureza', 'descricao', 'valor'],
          },
        },
      },
      required: ['company_id', 'tomador', 'itens'],
    },
  },
  {
    name: 'generate_das_guia',
    description: 'AÇÃO: gera a guia do DAS com Pix copia-e-cola. Requer confirmação explícita do usuário.',
    is_action: true,
    input_schema: {
      type: 'object',
      properties: { company_id: companyId, ref_period: { type: 'string' } },
      required: ['company_id'],
    },
  },
];

/** Forma aceita pela API Claude (sem o campo interno is_action). */
export function claudeTools() {
  return toolSchemas.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
