/**
 * Tradução de eventos de domínio (§14.1) em alertas humanizados (§9, §6.4).
 *
 * Usa templates determinísticos em PT-BR — testáveis e sem dependência de rede.
 * Em produção, o Agente de IA pode refinar o `body` (hook opcional), mas o
 * template garante que o alerta saia mesmo sem a API disponível.
 */
import type { EventRecord } from '../repo/types.js';
import type { AlertMessage } from './channel.js';

function brl(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? `R$ ${n.toLocaleString('pt-BR')}` : String(v);
}

export function humanize(ev: EventRecord): AlertMessage {
  const p = ev.payload;
  let title = 'Aviso do Copiloto';
  let body = 'Há uma novidade na sua empresa.';

  switch (ev.event_type) {
    case 'limit.threshold_50':
      title = 'Você passou da metade do limite';
      body = `Seu faturamento dos últimos 12 meses já é ${p.usage_pct}% do teto (${brl(p.limit)}). Tudo tranquilo — só de olho.`;
      break;
    case 'limit.threshold_80':
      title = 'Atenção: 80% do limite';
      body = `Você já usou ${p.usage_pct}% do teto do seu regime (${brl(p.limit)}). Vale começar a planejar. Quer que eu simule a migração para ME?`;
      break;
    case 'limit.threshold_95':
      title = 'Urgente: quase no teto';
      body = `Você está em ${p.usage_pct}% do limite (${brl(p.limit)}). O risco de desenquadramento é real — posso te mostrar as opções agora.`;
      break;
    case 'limit.projected_overflow':
      title = 'Você vai estourar o limite';
      body = `No ritmo atual, seu faturamento ultrapassa o teto de ${brl(p.limit)}. Bora resolver isso antes de virar problema?`;
      break;
    case 'obligation.due_soon':
      title = 'DAS perto de vencer';
      body = `Seu ${p.kind} de ${p.ref_period} (${brl(p.amount)}) vence em ${p.dias_restantes} dia(s), em ${p.due_date}. Quer que eu já gere a guia?`;
      break;
    case 'obligation.overdue':
      title = 'DAS vencido';
      body = `Seu ${p.kind} de ${p.ref_period} venceu há ${p.dias_atraso} dia(s) (vencimento ${p.due_date}). Posso calcular a multa e gerar a guia atualizada.`;
      break;
    case 'dasn.due_soon':
      title = 'Declaração anual (DASN) chegando';
      body = `A DASN de ${p.ref_period} vence em ${p.dias_restantes} dia(s), em ${p.due_date}. Eu cuido dela pra você — é rápido.`;
      break;
  }

  return { company_id: ev.company_id, severity: ev.severity, title, body };
}
