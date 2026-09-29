import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DeliveryDto,
  RepositoryOption,
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

  deliveries(zapId: string): Promise<DeliveryDto[]> {
    return firstValueFrom(this.http.get<DeliveryDto[]>(`/api/zaps/${zapId}/deliveries`));
  }

  triggerSample(triggerId: string): Promise<TriggerSample> {
    return firstValueFrom(this.http.get<TriggerSample>(`/api/triggers/${triggerId}/sample`));
  }

  repositories(): Promise<RepositoryOption[]> {
    return firstValueFrom(this.http.get<RepositoryOption[]>('/api/github/repositories'));
  }
}
