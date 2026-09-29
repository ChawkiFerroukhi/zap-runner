import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  CopilotKeyRejected,
  CopilotUnavailable,
  copilotDraftSchema,
  type CopilotModel,
} from './copilot-model.js';
import { COPILOT_SYSTEM_PROMPT, describeRequest } from './copilot-prompt.js';

export function createOpenAiCopilotModel(model: string): CopilotModel {
  return {
    provider: {
      id: 'openai',
      name: 'OpenAI',
      models: [model],
      keyUrl: 'https://platform.openai.com/api-keys',
      pricing: 'paid',
    },

    async verifyKey(apiKey) {
      try {
        await new OpenAI({ apiKey, maxRetries: 0 }).models.retrieve(model);
      } catch (error) {
        if (
          error instanceof OpenAI.AuthenticationError ||
          error instanceof OpenAI.PermissionDeniedError
        ) {
          throw new CopilotKeyRejected('The API key was rejected');
        }
        if (error instanceof OpenAI.NotFoundError) {
          throw new CopilotUnavailable(`This key cannot use the model ${model}`);
        }
        throw new CopilotUnavailable('Could not reach the model provider to check the key');
      }
    },

    async draft(apiKey, request) {
      try {
        const response = await new OpenAI({ apiKey }).responses.parse({
          model,
          instructions: COPILOT_SYSTEM_PROMPT,
          input: describeRequest(request),
          text: { format: zodTextFormat(copilotDraftSchema, 'zap_draft') },
        });
        if (!response.output_parsed)
          throw new CopilotUnavailable('The model returned an unreadable draft');
        return { draft: response.output_parsed, model: response.model };
      } catch (error) {
        if (error instanceof OpenAI.AuthenticationError) {
          throw new CopilotKeyRejected('The saved API key is no longer valid');
        }
        if (error instanceof OpenAI.RateLimitError) {
          throw new CopilotUnavailable(
            'The model provider is rate limiting this key. Try again shortly.',
          );
        }
        if (error instanceof OpenAI.APIError) {
          throw new CopilotUnavailable(
            `The model provider returned an error (${String(error.status)})`,
          );
        }
        throw error;
      }
    },
  };
}
