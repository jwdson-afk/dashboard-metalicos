/**
 * Camada de configuração tributária versionada — a fonte única da verdade.
 *
 * Princípio inegociável da spec (§1.3.6, §19, §20.5, "Observações finais #4"):
 * NENHUM valor tributário (alíquota, prazo, limite) pode ser hardcoded no código
 * de cálculo. Tudo resolve por aqui, versionado por ano de vigência (`year_valid`).
 *
 * Esta camada é deliberadamente desacoplada do banco: em produção a implementação
 * carrega de PostgreSQL (tabela `tax_rules`); aqui carregamos de um JSON seed com a
 * mesma forma. O motor de cálculo só conhece a interface `TaxRules`.
 */

export interface FaixaSimples {
  faixa: number;
  de: number;
  ate: number;
  aliquota: number;
  deducao: number;
}

export interface TaxRuleRow {
  rule_key: string;
  year_valid: number;
  valid_from: string;
  valid_until?: string | null;
  value_numeric?: number | null;
  value_text?: string | null;
  metadata?: Record<string, unknown> | null;
  source_url?: string | null;
}

/**
 * Resultado de uma resolução de regra — carrega o valor E a versão usada,
 * para que todo cálculo possa gravar `rule_version` no audit_log (§5.7, §16).
 */
export interface ResolvedRule<T> {
  key: string;
  year: number;
  value: T;
}

export class RuleNotFoundError extends Error {
  constructor(key: string, year: number) {
    super(`Regra tributária ausente: '${key}' para o ano ${year}. ` +
      `Nenhum valor pode ser assumido — atualize a tabela tax_rules.`);
    this.name = 'RuleNotFoundError';
  }
}

/**
 * Provedor de regras. O motor recebe esta interface por injeção, nunca lê o banco direto.
 */
export class TaxRules {
  private readonly byKeyYear = new Map<string, TaxRuleRow>();
  /** chaves de regra efetivamente lidas — rastreabilidade para o audit_log */
  private readonly _touched = new Set<string>();

  constructor(rows: TaxRuleRow[]) {
    for (const row of rows) {
      this.byKeyYear.set(`${row.rule_key}@${row.year_valid}`, row);
    }
  }

  static fromSeed(seed: { rules: TaxRuleRow[] }): TaxRules {
    return new TaxRules(seed.rules);
  }

  private get(key: string, year: number): TaxRuleRow {
    const row = this.byKeyYear.get(`${key}@${year}`);
    if (!row) throw new RuleNotFoundError(key, year);
    this._touched.add(`${key}@${year}`);
    return row;
  }

  /** Valor numérico (alíquota, limite, valor fixo). */
  numeric(key: string, year: number): number {
    const row = this.get(key, year);
    if (row.value_numeric == null) throw new RuleNotFoundError(key, year);
    return row.value_numeric;
  }

  /** Valor textual (prazos como '2026-05-31'). */
  text(key: string, year: number): string {
    const row = this.get(key, year);
    if (row.value_text == null) throw new RuleNotFoundError(key, year);
    return row.value_text;
  }

  /** Metadata estruturada (faixas do Simples, cronograma da Reforma). */
  metadata<T = Record<string, unknown>>(key: string, year: number): T {
    const row = this.get(key, year);
    if (row.metadata == null) throw new RuleNotFoundError(key, year);
    return row.metadata as T;
  }

  /** Faixas de um Anexo do Simples, ordenadas. */
  faixasSimples(anexo: string, year: number): FaixaSimples[] {
    const meta = this.metadata<{ faixas: FaixaSimples[] }>(`simples.anexo_${anexo}`, year);
    return [...meta.faixas].sort((a, b) => a.de - b.de);
  }

  /** Conjunto de chaves usadas até agora — grave em audit_log.rule_version. */
  ruleVersion(): string[] {
    return [...this._touched].sort();
  }
}
