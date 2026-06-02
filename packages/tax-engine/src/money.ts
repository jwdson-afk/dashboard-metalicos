/** Utilitários monetários. Trabalhamos em reais com arredondamento bancário a 2 casas. */

/** Arredonda para 2 casas (centavos), evitando o erro clássico de ponto flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Formata em BRL para exibição (R$ 1.234,56). */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
