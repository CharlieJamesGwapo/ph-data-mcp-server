import * as z from 'zod/v4';

export const CHARACTER_LIMIT = 25_000;

export const responseFormat = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe("'markdown' for readable text (default), 'json' for structured data");

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
};

/** Returns Markdown text, or JSON text plus the same data as structuredContent. */
export function respond(format: 'markdown' | 'json', data: Record<string, unknown>, markdown: () => string): ToolResult {
  if (format === 'json') return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
  return { content: [{ type: 'text', text: markdown() }] };
}

/** Halves the item list until the rendered result fits CHARACTER_LIMIT, so pagination stays accurate. */
export function fitToLimit<T>(items: T[], render: (page: T[]) => ToolResult): { page: T[]; result: ToolResult } {
  let page = items;
  let result = render(page);
  while (page.length > 1 && result.content[0].text.length > CHARACTER_LIMIT) {
    page = page.slice(0, Math.ceil(page.length / 2));
    result = render(page);
  }
  return { page, result };
}
