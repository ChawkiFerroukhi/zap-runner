import type { CopilotRequest } from './copilot-model.js';

export const COPILOT_SYSTEM_PROMPT = `You turn a user's description of an automation into a draft Zap for Zap Runner.

A Zap is one trigger plus one action. The catalogue below lists every trigger and action that exists, with the settings each one takes and, for triggers, the fields the action can reference. Only use ids, setting keys and fields from the catalogue.

- Settings of kind "template" or "multiline-template" may reference trigger fields as {{field.key}}. Use only fields the chosen trigger lists in outputFields.
- A trigger's mappingHints are good defaults for the action's settings with the same keys.
- Settings of kind "repository" must be one of the user's repositories, written exactly as listed.
- If the user has exactly one repository, use it.
- Set status to "needs_repository" when the description does not make clear which repository to use and the user has more than one. Still fill in every other setting, leave the repository setting as an empty string, and put a short question in the question field.
- Set status to "needs_clarification" when something other than the repository is too ambiguous to guess, with one short question in the question field.
- Set status to "unsupported" when the catalogue cannot express what was asked, and say what is missing in the explanation. Do not approximate with a different trigger or action.
- Otherwise set status to "ready" and leave question empty.
- Whatever the status, give the Zap a short name, and make the explanation one sentence saying what the Zap will do (or, for "unsupported", what is missing). Questions go only in the question field, never in the explanation.
`;

export function describeRequest(request: CopilotRequest): string {
  const catalogue = {
    triggers: request.registry.triggers.map(({ sample: _sample, ...trigger }) => trigger),
    actions: request.registry.actions,
  };
  const sections = [
    `Catalogue:\n${JSON.stringify(catalogue)}`,
    `The user's repositories:\n${request.repositories.length > 0 ? request.repositories.join('\n') : '(none)'}`,
    `Description:\n${request.prompt}`,
    ...(request.clarification
      ? [`The user answered your question:\n${request.clarification}`]
      : []),
  ];
  if (request.correction) {
    sections.push(
      `Your previous draft was rejected:\n${JSON.stringify(request.correction.previous)}\nProblems:\n${request.correction.problems.join('\n')}\nReturn a corrected draft.`,
    );
  }
  return sections.join('\n\n');
}
