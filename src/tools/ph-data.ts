import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { apiGet } from '../api.js';
import { fitToLimit, respond, responseFormat } from '../format.js';

type List<T> = { count: number; data: T[] };
type Holiday = { date: string; name: string; type: string; year: number };
type Region = { code: string; name: string; designation: string; island_group: string; regional_center: string };
type School = { code: string; name: string; type: string; city: string; region: string };
type Conversion = { from: string; to: string; amount: number; result: number; rate: number; updated_at: string };
type Weather = {
  city: string;
  current: Record<string, number | string>;
  current_units?: Record<string, string>;
};

const readOnlyApi = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

export function registerPhDataTools(server: McpServer) {
  server.registerTool(
    'ph_list_holidays',
    {
      title: 'List Philippine holidays',
      description:
        'Philippine regular and special non-working holidays (currently 2026 and 2027), with date, name and type. ' +
        'Example: "When is Holy Week 2027?" or "regular holidays this year".',
      inputSchema: z.strictObject({
        year: z.number().int().min(2000).max(2100).optional().describe('Year, e.g. 2026'),
        type: z.enum(['regular', 'special']).optional().describe("'regular' or 'special' (non-working)"),
        response_format: responseFormat,
      }),
      annotations: readOnlyApi,
    },
    async ({ year, type, response_format }, ctx) => {
      const { data } = await apiGet<List<Holiday>>('/holidays', { year, type }, ctx.mcpReq.signal);
      return respond(response_format, { count: data.length, holidays: data }, () =>
        data.length === 0
          ? 'No holidays found for those filters. Data currently covers 2026 and 2027.'
          : [`${data.length} holiday(s):`, ...data.map((h) => `- ${h.date}: ${h.name} (${h.type})`)].join('\n'),
      );
    },
  );

  server.registerTool(
    'ph_list_regions',
    {
      title: 'List Philippine regions',
      description:
        'The 17 regions of the Philippines with code (e.g. NCR, R10, BARMM), name, island group and regional center. ' +
        'Use the codes as the region filter in ph_list_schools.',
      inputSchema: z.strictObject({
        island_group: z.enum(['Luzon', 'Visayas', 'Mindanao']).optional().describe('Only regions in this island group'),
        response_format: responseFormat,
      }),
      annotations: readOnlyApi,
    },
    async ({ island_group, response_format }, ctx) => {
      const { data } = await apiGet<List<Region>>('/regions', { island_group }, ctx.mcpReq.signal);
      return respond(response_format, { count: data.length, regions: data }, () =>
        [`${data.length} region(s):`, ...data.map((r) => `- **${r.code}** ${r.name} (${r.designation}) · ${r.island_group} · center: ${r.regional_center}`)].join('\n'),
      );
    },
  );

  server.registerTool(
    'ph_list_schools',
    {
      title: 'List Philippine universities and colleges',
      description:
        'Philippine universities and colleges with code, type (e.g. State, Private), city and region. ' +
        'Filter by region code from ph_list_regions (e.g. "R10") and by type (e.g. "State"). Partial coverage, not every school.',
      inputSchema: z.strictObject({
        region: z.string().max(10).optional().describe('Region code, e.g. "NCR" or "R10"'),
        type: z.string().max(30).optional().describe('School type to match, e.g. "State" or "Private"'),
        limit: z.number().int().min(1).max(100).default(25).describe('Maximum number of schools'),
        offset: z.number().int().min(0).default(0).describe('Number of schools to skip, for pagination'),
        response_format: responseFormat,
      }),
      annotations: readOnlyApi,
    },
    async ({ region, type, limit, offset, response_format }, ctx) => {
      const { data } = await apiGet<List<School>>('/schools', { region, type }, ctx.mcpReq.signal);
      const render = (page: School[]) => {
        const next = offset + page.length;
        const hasMore = data.length > next;
        return respond(
          response_format,
          { total: data.length, count: page.length, offset, schools: page, has_more: hasMore, ...(hasMore ? { next_offset: next } : {}) },
          () =>
            [
              `${data.length} school(s) match; showing ${page.length} from offset ${offset}.`,
              ...page.map((s) => `- **${s.name}** (\`${s.code}\`) · ${s.type} · ${s.city}, ${s.region}`),
              hasMore ? `More results: call again with offset=${next}.` : '',
            ]
              .filter(Boolean)
              .join('\n'),
        );
      };
      return fitToLimit(data.slice(offset, offset + limit), render).result;
    },
  );

  server.registerTool(
    'ph_convert_currency',
    {
      title: 'Convert currency (Philippine peso rates)',
      description:
        'Convert an amount between currencies using current exchange rates based on the Philippine peso (PHP), ' +
        'e.g. 100 USD to PHP. Rates come from open.er-api.com and update daily.',
      inputSchema: z.strictObject({
        from: z.string().regex(/^[A-Za-z]{3}$/).describe('3-letter currency code to convert from, e.g. "USD"'),
        to: z.string().regex(/^[A-Za-z]{3}$/).default('PHP').describe('3-letter currency code to convert to (default PHP)'),
        amount: z.number().positive().max(1e12).default(1).describe('Amount to convert'),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ from, to, amount, response_format }, ctx) => {
      const r = await apiGet<Conversion>('/currency/convert', { from: from.toUpperCase(), to: to.toUpperCase(), amount }, ctx.mcpReq.signal);
      if (typeof r.result !== 'number') throw new Error(`Could not convert ${from} to ${to}. Check that both are valid 3-letter currency codes.`);
      return respond(response_format, { ...r }, () => `${r.amount} ${r.from} = **${r.result.toFixed(2)} ${r.to}** (rate ${r.rate}, updated ${r.updated_at})`);
    },
  );

  server.registerTool(
    'ph_get_weather',
    {
      title: 'Current weather in a Philippine city',
      description:
        'Current weather (temperature, humidity, feels-like, rain, wind) for a major Philippine city, from Open-Meteo. ' +
        'Use a city slug such as "manila", "quezon-city", "cebu-city", "davao-city" or "cagayan-de-oro".',
      inputSchema: z.strictObject({
        city: z.string().min(2).max(40).describe('City slug, e.g. "manila" or "cebu-city"'),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ city, response_format }, ctx) => {
      const slug = city.trim().toLowerCase().replace(/\s+/g, '-');
      let w: Weather;
      try {
        w = await apiGet<Weather>(`/weather/${encodeURIComponent(slug)}`, {}, ctx.mcpReq.signal);
      } catch (err) {
        const cities = await apiGet<List<{ slug: string }>>('/weather/cities', {}, ctx.mcpReq.signal).catch(() => null);
        throw new Error(`${(err as Error).message}${cities ? ` Supported cities: ${cities.data.map((c) => c.slug).join(', ')}.` : ''}`);
      }
      const c = w.current;
      return respond(response_format, { ...w }, () =>
        `**${w.city}** now: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), humidity ${c.relative_humidity_2m}%, ` +
        `rain ${c.precipitation} mm, wind ${c.wind_speed_10m} km/h. Observed ${c.time} (Asia/Manila).`,
      );
    },
  );
}
