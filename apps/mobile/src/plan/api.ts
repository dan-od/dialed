import type {
  ApprovePlanBody,
  PlanDTO,
  PlanSummary,
  ProviderId,
  TogglePlanChangeBody,
} from '@dialed/contracts';
import type { ApiClient } from '../api/client';

export interface PlanCreateParams {
  request_text: string;
  provider_mode: 'server' | 'byo';
  provider?: ProviderId;
  answer_to?: string;
  idempotency_key: string;
}

export interface ByoKeyHeaders {
  provider_key?: string;
  provider_base_url?: string;
}

function byoHeaders(byo?: ByoKeyHeaders): Record<string, string> {
  const h: Record<string, string> = {};
  if (byo?.provider_key) h['x-provider-key'] = byo.provider_key;
  if (byo?.provider_base_url) h['x-provider-base-url'] = byo.provider_base_url;
  return h;
}

export interface ApproveResult {
  revision: number;
  applied: string[];
  effective_from: string;
}

export class PlanApi {
  constructor(private readonly client: ApiClient) {}

  async create(params: PlanCreateParams, byo?: ByoKeyHeaders): Promise<PlanDTO> {
    return this.client.request<PlanDTO>(
      'POST',
      '/v1/plans',
      {
        source: 'in_app' as const,
        request_text: params.request_text,
        provider_mode: params.provider_mode,
        provider: params.provider,
        answer_to: params.answer_to,
      },
      { headers: { 'idempotency-key': params.idempotency_key, ...byoHeaders(byo) } },
    );
  }

  async get(id: string): Promise<PlanDTO> {
    return this.client.request<PlanDTO>('GET', `/v1/plans/${id}`);
  }

  async list(limit = 10): Promise<{ plans: PlanSummary[] }> {
    return this.client.request<{ plans: PlanSummary[] }>('GET', `/v1/plans?limit=${limit}`);
  }

  async answer(id: string, body: { option?: string; text?: string }): Promise<PlanDTO> {
    return this.client.request<PlanDTO>('POST', `/v1/plans/${id}/answer`, body);
  }

  async reply(id: string, text: string): Promise<PlanDTO> {
    return this.client.request<PlanDTO>('POST', `/v1/plans/${id}/reply`, { text });
  }

  async toggle(id: string, changeId: string, body: TogglePlanChangeBody): Promise<PlanDTO> {
    return this.client.request<PlanDTO>('PATCH', `/v1/plans/${id}/changes/${changeId}`, body);
  }

  /** The server answers with what it applied, not the plan (refetch the plan if you need it). */
  async approve(id: string, body: ApprovePlanBody): Promise<ApproveResult> {
    return this.client.request<ApproveResult>('POST', `/v1/plans/${id}/approve`, body);
  }

  async discard(id: string): Promise<void> {
    await this.client.request<void>('POST', `/v1/plans/${id}/discard`);
  }

  async redo(id: string, byo?: ByoKeyHeaders): Promise<PlanDTO> {
    return this.client.request<PlanDTO>('POST', `/v1/plans/${id}/redo`, undefined, {
      headers: byoHeaders(byo),
    });
  }

  async cancel(id: string): Promise<void> {
    await this.client.request<void>('POST', `/v1/plans/${id}/cancel`);
  }

  async testKey(
    provider: ProviderId,
    byo: ByoKeyHeaders,
  ): Promise<{ ok: boolean; message?: string }> {
    return this.client.request<{ ok: boolean; message?: string }>(
      'POST',
      '/v1/ai/test-key',
      { provider },
      { headers: byoHeaders(byo) },
    );
  }
}
