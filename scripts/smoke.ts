/**
 * Self-check: starts the built server over stdio, calls every tool, and exits non-zero on any failure.
 * Run with: npm run build && npm run smoke   (the ph_* data tools need internet access)
 */
import { strict as assert } from 'node:assert';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['dist/index.js'], env: getDefaultEnvironment() }));

const text = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as { type: string; text: string }[])[0].text;
async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  assert.ok(!r.isError, `${name} failed: ${text(r)}`);
  return r;
}

const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), [
  'ph_convert_currency', 'ph_get_scholarship', 'ph_get_weather', 'ph_list_holidays',
  'ph_list_regions', 'ph_list_scholarships', 'ph_list_schools', 'ph_search_scholarships',
]);

// Scholarships (bundled data)
const search = await call('ph_search_scholarships', { query: 'anak ng OFW', response_format: 'json' });
const found = (search.structuredContent as { scholarships: { id: string }[] }).scholarships.map((s) => s.id);
assert.ok(found.some((id) => id.startsWith('owwa-')), `OFW search should find OWWA programs, got ${found}`);
const taglish = await call('ph_search_scholarships', { query: 'Incoming college ako, BS Engineering' });
assert.match(text(taglish), /DOST/);
const detail = await call('ph_get_scholarship', { id: 'owwa-edsp' });
assert.match(text(detail), /60,000/);
const missing = await client.callTool({ name: 'ph_get_scholarship', arguments: { id: 'owwa-edps' } });
assert.equal(missing.isError, true);
assert.match(text(missing), /Did you mean/);
const list = await call('ph_list_scholarships', { provider_type: 'lgu', response_format: 'json' });
assert.equal((list.structuredContent as { total: number }).total, 3);
const page = await call('ph_list_scholarships', { limit: 10, response_format: 'json' });
assert.equal((page.structuredContent as { next_offset: number }).next_offset, 10);

// Live data via ph-public-api
const hol = await call('ph_list_holidays', { year: 2026, type: 'regular', response_format: 'json' });
assert.ok((hol.structuredContent as { count: number }).count > 0);
const reg = await call('ph_list_regions', { island_group: 'Mindanao' });
assert.match(text(reg), /BARMM/);
const sch = await call('ph_list_schools', { region: 'R10', type: 'State', response_format: 'json' });
assert.ok((sch.structuredContent as { total: number }).total > 0);
const fx = await call('ph_convert_currency', { from: 'usd', amount: 10 });
assert.match(text(fx), /10 USD = \*\*[\d.]+ PHP\*\*/);
const wx = await call('ph_get_weather', { city: 'Cebu City' });
assert.match(text(wx), /°C/);
const badCity = await client.callTool({ name: 'ph_get_weather', arguments: { city: 'atlantis' } });
assert.equal(badCity.isError, true);
assert.match(text(badCity), /Supported cities/);

// Invalid input comes back as a readable tool error
const invalid = await client.callTool({ name: 'ph_search_scholarships', arguments: { query: 'x' } });
assert.equal(invalid.isError, true);

console.error('\n--- sample output: ph_search_scholarships("anak ng OFW") ---\n' + text(await call('ph_search_scholarships', { query: 'anak ng OFW', limit: 2 })));
await client.close();
console.error('\nSmoke test passed: 8 tools, 16 checks');
