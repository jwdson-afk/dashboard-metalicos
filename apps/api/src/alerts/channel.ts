/**
 * Canais de alerta (spec §9.3). Cada canal entrega uma mensagem já humanizada.
 * Stubs determinísticos para dev/testes; adaptadores reais (WhatsApp/e-mail)
 * guardados por env e estruturalmente completos.
 */
export interface AlertMessage {
  company_id: string;
  severity: string;
  title: string;
  body: string;
}

export interface AlertChannel {
  readonly name: string;
  send(msg: AlertMessage): Promise<void>;
}

/** Canal em memória — guarda o que foi enviado (usado em testes). */
export class InMemoryChannel implements AlertChannel {
  readonly name = 'memory';
  readonly sent: AlertMessage[] = [];
  async send(msg: AlertMessage): Promise<void> {
    this.sent.push(msg);
  }
}

/** Canal de log (dev). */
export class ConsoleChannel implements AlertChannel {
  readonly name = 'console';
  async send(msg: AlertMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[alerta:${msg.severity}] ${msg.company_id} — ${msg.title}: ${msg.body}`);
  }
}

/**
 * WhatsApp via Cloud API (estrutural). Ativado por WHATSAPP_TOKEN + WHATSAPP_PHONE_ID.
 * Não exercitado em testes (sem rede).
 */
export class WhatsAppChannel implements AlertChannel {
  readonly name = 'whatsapp';
  constructor(
    private token = process.env.WHATSAPP_TOKEN ?? '',
    private phoneId = process.env.WHATSAPP_PHONE_ID ?? '',
    private resolvePhone: (companyId: string) => Promise<string> = async () => process.env.WHATSAPP_TEST_TO ?? '',
  ) {}

  async send(msg: AlertMessage): Promise<void> {
    if (!this.token || !this.phoneId) throw new Error('Credenciais do WhatsApp ausentes.');
    const to = await this.resolvePhone(msg.company_id);
    await fetch(`https://graph.facebook.com/v21.0/${this.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: `*${msg.title}*\n\n${msg.body}` },
      }),
    });
  }
}

/** Seleciona os canais ativos por env (default: console). */
export function getChannels(): AlertChannel[] {
  const channels: AlertChannel[] = [];
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) channels.push(new WhatsAppChannel());
  if (channels.length === 0) channels.push(new ConsoleChannel());
  return channels;
}
