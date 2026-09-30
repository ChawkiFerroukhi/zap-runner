import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  RepositoryOption,
  RunFilter,
  RunPage,
  RunRange,
  TestRunResult,
  TriggerSample,
  ZapDto,
  ZapInput,
} from '@zap-runner/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ZapsApi {
  private readonly http = inject(HttpClient);

  list(): Promise<ZapDto[]> {
    return firstValueFrom(this.http.get<ZapDto[]>('/api/zaps'));
  }

  get(zapId: string): Promise<ZapDto> {
    return firstValueFrom(this.http.get<ZapDto>(`/api/zaps/${zapId}`));
  }

  create(input: ZapInput): Promise<ZapDto> {
    return firstValueFrom(this.http.post<ZapDto>('/api/zaps', input));
  }

  update(zapId: string, input: ZapInput): Promise<ZapDto> {
    return firstValueFrom(this.http.put<ZapDto>(`/api/zaps/${zapId}`, input));
  }

  setEnabled(zapId: string, enabled: boolean): Promise<ZapDto> {
    const action = enabled ? 'enable' : 'disable';
    return firstValueFrom(this.http.post<ZapDto>(`/api/zaps/${zapId}/${action}`, null));
  }

  async remove(zapId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/zaps/${zapId}`));
  }

  runs(
    zapId: string,
    query: { filter: RunFilter; range: RunRange; cursor?: string | null; limit?: number },
  ): Promise<RunPage> {
    let params = new HttpParams().set('filter', query.filter).set('range', query.range);
    if (query.cursor) params = params.set('cursor', query.cursor);
    if (query.limit) params = params.set('limit', String(query.limit));
    return firstValueFrom(this.http.get<RunPage>(`/api/zaps/${zapId}/deliveries`, { params }));
  }

  allRuns(query: {
    filter: RunFilter;
    range: RunRange;
    zapId?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<RunPage> {
    let params = new HttpParams().set('filter', query.filter).set('range', query.range);
    if (query.zapId) params = params.set('zapId', query.zapId);
    if (query.cursor) params = params.set('cursor', query.cursor);
    if (query.limit) params = params.set('limit', String(query.limit));
    return firstValueFrom(this.http.get<RunPage>('/api/runs', { params }));
  }

  payload(zapId: string, deliveryId: string): Promise<{ payload: unknown }> {
    return firstValueFrom(
      this.http.get<{ payload: unknown }>(`/api/zaps/${zapId}/deliveries/${deliveryId}/payload`),
    );
  }

  replay(zapId: string, deliveryId: string): Promise<{ deliveryId: string }> {
    return firstValueFrom(
      this.http.post<{ deliveryId: string }>(
        `/api/zaps/${zapId}/deliveries/${deliveryId}/replay`,
        null,
      ),
    );
  }

  testRun(zapId: string): Promise<TestRunResult> {
    return firstValueFrom(this.http.post<TestRunResult>(`/api/zaps/${zapId}/test`, null));
  }

  triggerSample(triggerId: string): Promise<TriggerSample> {
    return firstValueFrom(this.http.get<TriggerSample>(`/api/triggers/${triggerId}/sample`));
  }

  repositories(): Promise<RepositoryOption[]> {
    return firstValueFrom(this.http.get<RepositoryOption[]>('/api/github/repositories'));
  }
}
