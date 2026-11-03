import MiniSearch from 'minisearch';

import { type Level, type Scholarship, scholarships as all } from './scholarships.js';

// Taglish and everyday words students use, mapped to the words the data uses.
const SYNONYMS: Record<string, string[]> = {
  kolehiyo: ['college'],
  college: ['undergraduate', 'tertiary'],
  undergrad: ['undergraduate', 'college'],
  shs: ['senior', 'high'],
  'senior high': ['senior_high'],
  grade: ['senior_high'],
  masters: ['graduate', 'master'],
  phd: ['graduate', 'doctoral'],
  tesda: ['tech_voc', 'technical', 'vocational'],
  vocational: ['tech_voc', 'technical'],
  libre: ['free', 'tuition'],
  allowance: ['stipend', 'allowance'],
  baon: ['stipend', 'allowance'],
  pera: ['financial', 'assistance', 'stipend'],
  tulong: ['assistance', 'financial'],
  mahirap: ['low-income', 'household', 'income', 'subsidy', 'assistance', 'disadvantaged'],
  poor: ['low-income', 'household', 'income', 'subsidy', 'assistance', 'disadvantaged'],
  'pang-aral': ['educational', 'assistance'],
  '4ps': ['4ps', 'pantawid', 'listahanan', 'low-income'],
  nursing: ['health', 'nursing'],
  medicine: ['medicine', 'medical', 'health'],
  doctor: ['medicine', 'medical'],
  ofw: ['owwa', 'overseas', 'migrant'],
  engineering: ['STEM', 'engineering'],
  science: ['STEM', 'science'],
  bsit: ['STEM', 'technology', 'information'],
  'information technology': ['STEM', 'technology'],
  'computer science': ['STEM', 'technology'],
  teacher: ['education'],
  education: ['education'],
  farming: ['agriculture'],
  agri: ['agriculture'],
};

// Words that appear in almost every question or entry and only add noise to matching.
const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do for from give gives how i if in is it me my of on or so that the this to ' +
    'what when where which who will with you your any ' +
    'ako ba ang mga na ng sa para po pwede anong ano may meron yung ko mo ka kung lang din rin naman ' +
    'scholarship scholarships program programs grant grants'
  ).split(' '),
);

/** Matches scoring below this share of the best match are dropped as noise. */
const MIN_RELATIVE_SCORE = 0.3;

const LEVEL_HINTS: [RegExp, Level][] = [
  [/\b(shs|senior high|grade 1[12])\b/i, 'senior_high'],
  [/\b(college|kolehiyo|undergrad\w*|bachelor|freshman|incoming college)\b/i, 'college'],
  [/\b(master'?s|masters|phd|doctoral|graduate school|grad school)\b/i, 'graduate'],
  [/\b(tesda|tech[- ]?voc|vocational|nc ?ii)\b/i, 'tech_voc'],
];

export function detectLevel(query: string): Level | undefined {
  return LEVEL_HINTS.find(([re]) => re.test(query))?.[1];
}

export function expandQuery(query: string): string {
  const q = query.toLowerCase();
  const extra = Object.entries(SYNONYMS)
    .filter(([k]) => new RegExp(`\\b${k}s?\\b`).test(q))
    .flatMap(([, v]) => v);
  return [query, ...extra].join(' ');
}

export function buildIndex(items: Scholarship[]) {
  const index = new MiniSearch<Scholarship>({
    fields: ['name', 'provider', 'summary', 'eligibility', 'benefits', 'fields', 'levels', 'regions', 'notes'],
    storeFields: ['id'],
    processTerm: (term) => {
      const t = term.toLowerCase();
      return STOPWORDS.has(t) ? null : t;
    },
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      return Array.isArray(v) ? v.join(' ') : ((v as string | null) ?? '');
    },
    searchOptions: {
      boost: { name: 3, provider: 2, fields: 2, summary: 1.5 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'OR',
    },
  });
  index.addAll(items);
  return index;
}

const defaultIndex = buildIndex(all);

/**
 * Finds the scholarships most relevant to a question. If the question names a
 * level (SHS, college, grad school, TESDA), programs for other levels are dropped.
 */
export function searchScholarships(query: string, limit = 6, items: Scholarship[] = all): Scholarship[] {
  const index = items === all ? defaultIndex : buildIndex(items);
  const byId = new Map(items.map((s) => [s.id, s]));
  const level = detectLevel(query);

  const raw = index.search(expandQuery(query));
  const top = raw[0]?.score ?? 0;
  let hits = raw
    .filter((h) => h.score >= top * MIN_RELATIVE_SCORE)
    .map((h) => byId.get(h.id as string))
    .filter((s): s is Scholarship => !!s);

  if (level) hits = hits.filter((s) => s.levels.includes(level));

  // Few direct matches (e.g. "nursing" when no program names it): add nationwide
  // programs that accept any course, so the student still sees real options.
  // Skipped when nothing matched and no level was named, so off-topic questions get no sources.
  if (hits.length < 3 && (hits.length > 0 || level)) {
    const open = items.filter(
      (s) =>
        s.fields.includes('any') &&
        s.regions.some((r) => r.startsWith('nationwide')) &&
        s.provider_type === 'government' &&
        (!level || s.levels.includes(level)) &&
        !hits.includes(s),
    );
    hits = [...hits, ...open];
  }
  return hits.slice(0, limit);
}
