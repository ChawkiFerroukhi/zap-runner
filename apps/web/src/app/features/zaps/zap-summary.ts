import type { ZapDto } from '@zap-runner/shared';
import type { RegistryStore } from '../../core/registry.store';

export interface ZapSummary {
  triggerApp: string;
  triggerName: string;
  actionApp: string;
  actionName: string;
  repository: string;
}

export function summarize(zap: ZapDto, registry: RegistryStore): ZapSummary {
  const trigger = registry.trigger(zap.trigger.type);
  const action = registry.action(zap.action.type);
  const repository = zap.trigger.config['repository'];
  return {
    triggerApp: registry.app(trigger?.appId ?? '')?.name ?? 'Unknown app',
    triggerName: trigger?.name ?? zap.trigger.type,
    actionApp: registry.app(action?.appId ?? '')?.name ?? 'Unknown app',
    actionName: action?.name ?? zap.action.type,
    repository: typeof repository === 'string' ? repository : '',
  };
}

export function monogram(name: string): string {
  const capitals = name.replace(/[^A-Z]/g, '');
  return (capitals || name.charAt(0).toUpperCase()).slice(0, 2);
}
