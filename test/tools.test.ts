import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Webcite } from 'webcite';
import { webciteTools } from '../src/index.ts';

const dir = join(import.meta.dirname, 'fixtures');
const routes: Record<string, string> = {
  '/api/v1/verify': 'claim-great-wall.json',
  '/api/v1/sources/search': 'search-great-wall.json',
  '/api/v1/extract': 'doc-irs-w9.json',
};
const NASA = 'https://www.nasa.gov/image-article/great-wall/';
const W9 = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf';

function recorded() {
  const bodies: Array<{ path: string; body: unknown }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    bodies.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(readFileSync(join(dir, routes[path] as string), 'utf8'), { status: 200 });
  };
  return { client: new Webcite({ apiKey: 'webcite_test', fetch: fetch as typeof globalThis.fetch }), bodies };
}

const opts = { toolCallId: 't1', messages: [] };
type Exec = (input: unknown, o: typeof opts) => Promise<Record<string, any>>;
const run = (t: { execute?: unknown }, input: unknown) => (t.execute as Exec)(input, opts);

test('verifyClaim returns the verdict and citations bound to passages', async () => {
  const { client, bodies } = recorded();
  const out = await run(webciteTools({ client, maxCitations: 2 }).verifyClaim, {
    claim: 'The Great Wall of China is visible from the Moon with the naked eye.',
  });
  assert.equal(out.verdict, 'contradicted');
  assert.equal(out.credits, 4);
  assert.equal(out.citations.length, 2);
  assert.equal(out.citations[0].url, NASA);
  assert.equal(out.citations[0].stance, 'contradicts');
  assert.match(out.citations[0].passage, /isn't visible from the moon/);
  assert.match(out.citations[0].passageSha256, /^8ae9e93f/);
  assert.deepEqual(Object.keys(bodies[0]?.body as object).includes('source_urls'), false);
});

test('verifyClaim passes source URLs', async () => {
  const { client, bodies } = recorded();
  await run(webciteTools({ client }).verifyClaim, { claim: 'x', sourceUrls: [NASA] });
  assert.deepEqual((bodies[0]?.body as Record<string, unknown>).source_urls, [NASA]);
});

test('searchSources limits results and sends the limit', async () => {
  const { client, bodies } = recorded();
  const out = await run(webciteTools({ client }).searchSources, { query: 'great wall', limit: 3 });
  assert.equal(out.sources.length, 3);
  assert.equal(out.credits, 2);
  assert.deepEqual(bodies[0], { path: '/api/v1/sources/search', body: { query: 'great wall', limit: 3 } });
});

test('extractDocument returns state, pages, credits and Markdown', async () => {
  const { client, bodies } = recorded();
  const out = await run(webciteTools({ client, mode: 'lite' }).extractDocument, { url: W9 });
  assert.equal(out.state, 'complete');
  assert.equal(out.pages, 1);
  assert.equal(out.credits, 0.4966);
  assert.match(out.markdown, /^Form \*\*W-9\*\*/);
  assert.equal('reason' in out, false);
  assert.deepEqual(bodies[0]?.body, { asset_url: W9, mode: 'lite' });
});

test('extractDocument truncates and says so', async () => {
  const { client } = recorded();
  const out = await run(webciteTools({ client, maxChars: 20 }).extractDocument, { url: W9 });
  assert.equal(out.markdown.length, 20);
  assert.equal(out.truncatedToChars, 20);
});

test('input schemas reject an empty claim and a non-URL', () => {
  const tools = webciteTools({ client: recorded().client });
  const verify = tools.verifyClaim.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
  const extract = tools.extractDocument.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
  assert.equal(verify.safeParse({ claim: '' }).success, false);
  assert.equal(extract.safeParse({ url: 'not a url' }).success, false);
});
