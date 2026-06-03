/**
 * Provedor de emissão de Nota Fiscal (spec §10).
 *
 * O domínio (montagem/validação da nota) vive no @copiloto/tax-engine. Aqui fica
 * só a integração com o emissor externo. Estratégia por env:
 *   NF_PROVIDER=focus  + FOCUS_NFE_TOKEN   → adaptador HTTP Focus NFe
 *   (default)                              → stub determinístico (dev/demos/testes)
 */
import type { NotaCalculada } from '@copiloto/tax-engine';
import type { CompanyRecord } from '../repo/types.js';

export interface EmittedInvoice {
  provider: string;
  provider_ref: string;
  status: 'issued' | 'failed';
}

export interface NfProvider {
  readonly name: string;
  issue(company: CompanyRecord, refPeriod: string, nota: NotaCalculada): Promise<EmittedInvoice>;
}

/** Stub determinístico — não chama rede. Usado em dev/demos/testes. */
export class StubNfProvider implements NfProvider {
  readonly name = 'stub';
  async issue(company: CompanyRecord, refPeriod: string, _nota: NotaCalculada): Promise<EmittedInvoice> {
    return {
      provider: this.name,
      provider_ref: `DEMO-NF-${company.cnpj.replace(/\D/g, '')}-${refPeriod}`,
      status: 'issued',
    };
  }
}

/**
 * Adaptador Focus NFe (estrutural). Ativado por NF_PROVIDER=focus + token.
 * Não é exercitado nos testes (sem rede); o contrato é o mesmo do stub.
 */
export class FocusNfProvider implements NfProvider {
  readonly name = 'focus';
  constructor(
    private token = process.env.FOCUS_NFE_TOKEN ?? '',
    private baseUrl = process.env.FOCUS_NFE_URL ?? 'https://api.focusnfe.com.br',
  ) {}

  async issue(company: CompanyRecord, refPeriod: string, nota: NotaCalculada): Promise<EmittedInvoice> {
    if (!this.token) throw new Error('FOCUS_NFE_TOKEN ausente para o provedor Focus.');
    // NFS-e (serviço) e NF-e (produto) têm endpoints distintos no Focus.
    const recurso = nota.tipos.includes('nfse') ? 'nfse' : 'nfe';
    const ref = `${company.id}-${refPeriod}-${Date.now()}`;
    const auth = 'Basic ' + Buffer.from(`${this.token}:`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v2/${recurso}?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpj_emitente: company.cnpj.replace(/\D/g, ''),
        valor_servicos: nota.valor_total,
        valor_iss_retido: nota.iss_retido,
        // campos da Reforma (IBS/CBS) já calculados no domínio
        ibs: nota.reforma.ibs,
        cbs: nota.reforma.cbs,
      }),
    });
    return {
      provider: this.name,
      provider_ref: ref,
      status: res.ok ? 'issued' : 'failed',
    };
  }
}

let cached: NfProvider | null = null;

export function getNfProvider(): NfProvider {
  if (cached) return cached;
  cached = process.env.NF_PROVIDER === 'focus' ? new FocusNfProvider() : new StubNfProvider();
  return cached;
}

/** Atalho usado pela tool issue_invoice. */
export function issueWithProvider(
  company: CompanyRecord,
  refPeriod: string,
  nota: NotaCalculada,
): Promise<EmittedInvoice> {
  return getNfProvider().issue(company, refPeriod, nota);
}
