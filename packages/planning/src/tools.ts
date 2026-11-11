export type ToolSchema = { name: string; description: string; input_schema: object };

export const PLAN_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'propose_changes',
    description:
      'Send a proposal for the user to review in the app. Does NOT change the schedule. ' +
      'Returns validation errors if a change breaks a rule.',
    input_schema: {
      type: 'object',
      properties: {
        request_text: {
          type: 'string',
          description: 'A short summary of what the plan does.',
        },
        changes: {
          type: 'array',
          items: { type: 'object' },
          minItems: 1,
          maxItems: 25,
          description: 'The schedule changes to propose.',
        },
        checks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              passed: { type: 'boolean' },
              detail: { type: 'string' },
            },
            required: ['id', 'passed', 'detail'],
          },
          description: 'Soft checks the model ran (day bounds, quiet hours, etc.).',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'ask_user',
    description:
      'Ask the user a clarifying question before proposing changes. ' +
      'The app shows the question with up to four option buttons.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to show.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description: 'Short option labels for the buttons.',
        },
      },
      required: ['question', 'options'],
    },
  },
];
