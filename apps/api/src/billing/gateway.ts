/**
 * Gateway de pagamento (spec §12). Abstrai a criação de cobranças Pix/boleto.
 *   PAYMENT_GATEWAY=asaas + ASAAS_API_KEY → adaptador Asaas (estrutural)
 *   (default)                             → stub determinístico (dev/demos/testes)
 */
export type ChargeMethod = 'pix' | 'boleto';

export interface ChargeRequest {
  company_cnpj: string;
  amount: number;
  method: ChargeMethod;
  due_date: string;
  description?: string;
  customer_name?: string;
}

export interface CreatedCharge {
  provider: string;
  provider_ref: string;
  pix_copia_cola: string | null;
  boleto_url: string | null;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(req: ChargeRequest): Promise<CreatedCharge>;
}

/** Stub determinístico — não chama rede. */
export class StubPaymentGateway implements PaymentGateway {
  readonly name = 'stub';
  async createCharge(req: ChargeRequest): Promise<CreatedCharge> {
    const ref = `DEMO-CHG-${req.company_cnpj.replace(/\D/g, '')}-${req.due_date}-${Math.round(req.amount * 100)}`;
    return {
      provider: this.name,
      provider_ref: ref,
      pix_copia_cola: req.method === 'pix' ? `00020126...${ref}` : null,
      boleto_url: req.method === 'boleto' ? `https://demo.local/boleto/${ref}.pdf` : null,
    };
  }
}

/**
 * Adaptador Asaas (estrutural). Ativado por PAYMENT_GATEWAY=asaas + ASAAS_API_KEY.
 * Não exercitado em testes (sem rede).
 */
export class AsaasPaymentGateway implements PaymentGateway {
  readonly name = 'asaas';
  constructor(
    private apiKey = process.env.ASAAS_API_KEY ?? '',
    private baseUrl = process.env.ASAAS_URL ?? 'https://api.asaas.com/v3',
  ) {}

  async createCharge(req: ChargeRequest): Promise<CreatedCharge> {
    if (!this.apiKey) throw new Error('ASAAS_API_KEY ausente.');
    const billingType = req.method === 'pix' ? 'PIX' : 'BOLETO';
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: { access_token: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingType, value: req.amount, dueDate: req.due_date, description: req.description }),
    });
    const json = (await res.json()) as { id: string; invoiceUrl?: string; payload?: string };
    return {
      provider: this.name,
      provider_ref: json.id,
      pix_copia_cola: req.method === 'pix' ? json.payload ?? null : null,
      boleto_url: req.method === 'boleto' ? json.invoiceUrl ?? null : null,
    };
  }
}

let cached: PaymentGateway | null = null;
export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;
  cached = process.env.PAYMENT_GATEWAY === 'asaas' ? new AsaasPaymentGateway() : new StubPaymentGateway();
  return cached;
}
