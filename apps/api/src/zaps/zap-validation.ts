import { templateReferences, type ZapInput } from '@zap-runner/shared';
import { isTemplateField } from '../integrations/define.js';
import type { Registry } from '../integrations/registry.js';
import { HttpError } from '../http/errors.js';

export function assertValidZap(input: ZapInput, registry: Registry): void {
  const errors: Record<string, string> = {};
  const trigger = registry.trigger(input.trigger.type);
  const action = registry.action(input.action.type);

  if (!trigger) {
    errors['trigger.type'] = 'Unknown trigger';
  } else {
    const parsed = trigger.parseConfig(input.trigger.config);
    if (!parsed.ok) {
      for (const [key, message] of Object.entries(parsed.errors)) {
        errors[`trigger.config.${key}`] = message;
      }
    }
  }

  if (!action) {
    errors['action.type'] = 'Unknown action';
  } else {
    const available = new Set(trigger?.descriptor.outputFields.map((field) => field.key) ?? []);
    for (const field of action.descriptor.configFields) {
      const value = input.action.config[field.key];
      const path = `action.config.${field.key}`;
      if (field.required && (value === undefined || value === '')) {
        errors[path] = 'Required';
        continue;
      }
      if (!isTemplateField(field) || typeof value !== 'string' || !trigger) continue;
      const unknown = templateReferences(value).filter((key) => !available.has(key));
      if (unknown.length > 0) {
        errors[path] = `Unknown field ${unknown.map((key) => `{{${key}}}`).join(', ')}`;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'invalid_zap', 'The Zap has invalid settings', errors);
  }
}
