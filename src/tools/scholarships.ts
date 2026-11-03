import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { fitToLimit, respond, responseFormat } from '../format.js';
import { type Scholarship, scholarships } from '../scholarships.js';
import { searchScholarships } from '../search.js';

const level = z
  .enum(['senior_high', 'college', 'graduate', 'tech_voc'])
  .describe('School level: senior_high, college, graduate, or tech_voc (TESDA)');

const DISCLAIMER =
  'Programs, amounts and deadlines change every school year; confirm on the official page before applying.';

function brief(s: Scholarship) {
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    levels: s.levels,
    regions: s.regions,
    summary: s.summary,
    application_period: s.application_period,
    official_url: s.official_url,
  };
}

function briefMarkdown(s: Scholarship): string {
  return [
    `### ${s.name} (\`${s.id}\`)`,
    `${s.provider} · ${s.levels.join(', ')} · ${s.regions.join(', ')}`,
    s.summary,
    `**When:** ${s.application_period ?? 'not stated on the official page'}`,
    `**Official page:** ${s.official_url}`,
  ].join('\n');
}

export function registerScholarshipTools(server: McpServer) {
  server.registerTool(
    'ph_search_scholarships',
    {
      title: 'Search Philippine scholarships',
      description:
        'Find Philippine scholarships and student financial aid that match a question, in English or Taglish ' +
        '(e.g. "incoming college, BS Engineering", "anak ng OFW", "TESDA courses", "grad school science"). ' +
        'Searches a curated list of programs (DOST, CHED, TESDA, OWWA, LGUs, foundations, universities) where every ' +
        'fact was checked against the official page. Returns the best matches with summary, period and official URL. ' +
        'Use ph_get_scholarship for full eligibility and benefits. Never state amounts or deadlines the results do not contain.',
      inputSchema: z.strictObject({
        query: z.string().min(2).max(300).describe('What the student is looking for, in English or Taglish'),
        level: level.optional().describe('Only return programs for this level (detected from the query if omitted)'),
        limit: z.number().int().min(1).max(15).default(5).describe('Maximum number of matches'),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, level, limit, response_format }) => {
      const pool = level ? scholarships.filter((s) => s.levels.includes(level)) : scholarships;
      const matches = searchScholarships(query, limit, pool);
      return respond(response_format, { query, count: matches.length, scholarships: matches.map(brief), note: DISCLAIMER }, () =>
        matches.length === 0
          ? `No matching scholarships for "${query}". Try naming the level (SHS, college, graduate, TESDA), the course, or the city, or call ph_list_scholarships.`
          : [`Found ${matches.length} matching scholarship(s) for "${query}":`, ...matches.map(briefMarkdown), `_${DISCLAIMER}_`].join('\n\n'),
      );
    },
  );

  server.registerTool(
    'ph_get_scholarship',
    {
      title: 'Get scholarship details',
      description:
        'Full details of one Philippine scholarship by id (from ph_search_scholarships or ph_list_scholarships): ' +
        'eligibility, benefits, application period, how to apply, official and source URLs, and the date it was last checked. ' +
        'Fields the official page does not state are null.',
      inputSchema: z.strictObject({
        id: z.string().min(2).max(80).describe('Scholarship id, e.g. "dost-sei-ra7687" or "owwa-edsp"'),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, response_format }) => {
      const s = scholarships.find((x) => x.id === id);
      if (!s) {
        const close = searchScholarships(id.replace(/-/g, ' '), 3).map((x) => x.id);
        throw new Error(
          `No scholarship with id "${id}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''} Use ph_search_scholarships to find ids.`,
        );
      }
      return respond(response_format, { ...s, note: DISCLAIMER }, () =>
        [
          `## ${s.name}`,
          `**Provider:** ${s.provider} (${s.provider_type})`,
          `**Levels:** ${s.levels.join(', ')} · **Fields:** ${s.fields.join(', ')} · **Where:** ${s.regions.join(', ')}`,
          s.summary,
          `**Eligibility**\n${s.eligibility.map((e) => `- ${e}`).join('\n') || '- not stated'}`,
          `**Benefits**\n${s.benefits.map((b) => `- ${b}`).join('\n') || '- not stated'}`,
          `**Application period:** ${s.application_period ?? 'not stated on the official page'}`,
          `**How to apply:** ${s.how_to_apply ?? 'not stated'}`,
          `**Official page:** ${s.official_url}`,
          s.notes ? `**Notes:** ${s.notes}` : '',
          `_Last checked ${s.last_checked}. ${DISCLAIMER}_`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    },
  );

  server.registerTool(
    'ph_list_scholarships',
    {
      title: 'List Philippine scholarships',
      description:
        'Browse the full curated list of Philippine scholarships with optional filters (level, provider type, region). ' +
        'Use ph_search_scholarships instead when you have a specific question.',
      inputSchema: z.strictObject({
        level: level.optional(),
        provider_type: z
          .enum(['government', 'lgu', 'private', 'university'])
          .optional()
          .describe('Who runs it: government (national), lgu (city), private (foundation/company), university'),
        region: z.string().max(60).optional().describe('Text to match in the regions served, e.g. "NCR", "Davao", "nationwide"'),
        limit: z.number().int().min(1).max(50).default(20).describe('Maximum number of programs'),
        offset: z.number().int().min(0).default(0).describe('Number of programs to skip, for pagination'),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ level, provider_type, region, limit, offset, response_format }) => {
      const r = region?.toLowerCase();
      const all = scholarships.filter(
        (s) =>
          (!level || s.levels.includes(level)) &&
          (!provider_type || s.provider_type === provider_type) &&
          (!r || s.regions.some((x) => x.toLowerCase().includes(r))),
      );
      const render = (page: Scholarship[]) => {
        const next = offset + page.length;
        const hasMore = all.length > next;
        return respond(
          response_format,
          { total: all.length, count: page.length, offset, scholarships: page.map(brief), has_more: hasMore, ...(hasMore ? { next_offset: next } : {}) },
          () =>
            [
              `${all.length} program(s) match; showing ${page.length} from offset ${offset}.`,
              ...page.map(briefMarkdown),
              hasMore ? `More results: call again with offset=${next}.` : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
        );
      };
      return fitToLimit(all.slice(offset, offset + limit), render).result;
    },
  );
}
