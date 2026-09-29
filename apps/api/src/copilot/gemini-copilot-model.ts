import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  CopilotKeyRejected,
  CopilotUnavailable,
  copilotDraftSchema,
  type CopilotDraft,
  type CopilotModel,
} from './copilot-model.js';
import { COPILOT_SYSTEM_PROMPT, describeRequest } from './copilot-prompt.js';

const draftJsonSchema = z.toJSONSchema(copilotDraftSchema);

function isKeyProblem(error: ApiError): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    (error.status === 400 && /api key/i.test(error.message))
  );
}

function isCapacityProblem(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status >= 500);
}

function parseDraft(text: string | undefined): CopilotDraft {
  if (!text) throw new CopilotUnavailable('The model returned an empty draft');
  try {
    const value: unknown = JSON.parse(text);
    return copilotDraftSchema.parse(value);
  } catch {
    throw new CopilotUnavailable('The model returned an unreadable draft');
  }
}

export function createGeminiCopilotModel(models: string[]): CopilotModel {
  const [primary = 'gemini-3.8-flash'] = models;

  return {
    provider: {
      id: 'gemini',
      name: 'Google Gemini',
      models,
      keyUrl: 'https://aistudio.google.com/apikey',
      pricing: 'free-tier',
    },

    async verifyKey(apiKey) {
      try {
        await new GoogleGenAI({ apiKey }).models.get({ model: primary });
      } catch (error) {
        if (error instanceof ApiError && isKeyProblem(error)) {
          throw new CopilotKeyRejected('The API key was rejected');
        }
        throw new CopilotUnavailable('Could not reach the model provider to check the key');
      }
    },

    async draft(apiKey, request, observer) {
      const client = new GoogleGenAI({ apiKey });
      let lastCapacityError: ApiError | undefined;
      for (const [index, model] of models.entries()) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: describeRequest(request),
            config: {
              systemInstruction: COPILOT_SYSTEM_PROMPT,
              responseMimeType: 'application/json',
              responseJsonSchema: draftJsonSchema,
            },
          });
          return { draft: parseDraft(response.text), model };
        } catch (error) {
          if (isCapacityProblem(error) && error instanceof ApiError) {
            lastCapacityError = error;
            const next = models[index + 1];
            if (next)
              observer?.fallback(model, next, error.status === 429 ? 'rate limited' : 'overloaded');
            continue;
          }
          if (error instanceof ApiError && isKeyProblem(error)) {
            throw new CopilotKeyRejected('The saved API key is no longer valid');
          }
          if (error instanceof ApiError) {
            throw new CopilotUnavailable(
              `The model provider returned an error (${String(error.status)})`,
            );
          }
          throw error;
        }
      }
      throw new CopilotUnavailable(
        lastCapacityError?.status === 429
          ? 'The free tier limit for this key was reached. Try again in a minute.'
          : 'Every Gemini model is overloaded right now. Try again in a moment.',
      );
    },
  };
}
