import { readFileSync } from 'node:fs';

export type Level = 'senior_high' | 'college' | 'graduate' | 'tech_voc';

export interface Scholarship {
  id: string;
  name: string;
  provider: string;
  provider_type: 'government' | 'lgu' | 'private' | 'university';
  levels: Level[];
  fields: string[];
  regions: string[];
  summary: string;
  eligibility: string[];
  benefits: string[];
  application_period: string | null;
  how_to_apply: string | null;
  official_url: string;
  source_urls: string[];
  last_checked: string;
  notes: string | null;
}

// Bundled with the package (data/ sits next to dist/), checked against official pages.
const raw = readFileSync(new URL('../data/scholarships.json', import.meta.url), 'utf8');

export const scholarships: Scholarship[] = (JSON.parse(raw) as (Scholarship & Record<string, unknown>)[]).map(
  ({ url_check: _drop, ...s }) => s as Scholarship,
);
