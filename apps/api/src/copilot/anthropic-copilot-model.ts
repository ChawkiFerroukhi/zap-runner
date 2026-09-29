import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  CopilotKeyRejected,
  CopilotUnavailable,
  copilotDraftSchema,
  type CopilotModel,
} from './copilot-model.js';
import { COPILOT_SYSTEM_PROMPT, describeRequest } from './copilot-prompt.js';

export function createAnthropicCopilotModel(model: string): CopilotModel {
  return {
    provider: {
      id: 'anthropic',
      name: 'Anthropic',
      models: [model],
      keyUrl: 'https://console.anthropic.com/settings/keys',
      pricing: 'paid',
    },

    async verifyKey(apiKey) {
      try {
        await new Anthropic({ apiKey, maxRetries: 0 }).models.retrieve(model);
      } catch (error) {
        if (
          error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError
        ) {
          throw new CopilotKeyRejected('The API key was rejected');
        }
        throw new CopilotUnavailable('Could not reach the model provider to check the key');
      }
    },

    async draft(apiKey, request) {
      const client = new Anthropic({ apiKey });
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: 4096,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low', format: betaZodOutputFormat(copilotDraftSchema) },
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: describeRequest(request) }],
        });
        if (response.stop_reason === 'refusal') {
          throw new CopilotUnavailable('The model declined this request');
        }
        if (!response.parsed_output) {
          throw new CopilotUnavailable('The model returned an unreadable draft');
        }
        return { draft: response.parsed_output, model: response.model };
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          throw new CopilotKeyRejected('The saved API key is no longer valid');
        }
        if (error instanceof Anthropic.RateLimitError) {
          throw new CopilotUnavailable(
            'The model provider is rate limiting this key. Try again shortly.',
          );
        }
        if (error instanceof Anthropic.APIError) {
          throw new CopilotUnavailable(
            `The model provider returned an error (${String(error.status)})`,
          );
        }
        throw error;
      }
    },
  };
}
