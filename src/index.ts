import { tool } from 'ai';
import { type ClientOptions, Webcite } from 'webcite';
import { z } from 'zod';

type Json = Record<string, unknown>;

export interface WebciteToolsOptions extends ClientOptions {
  /** An existing client. When set, the other options are ignored. */
  client?: Webcite;
  /** Citations returned to the model per verification. Default 5. */
  maxCitations?: number;
  /** Markdown characters returned to the model per document. Default 50,000. */
  maxChars?: number;
  /** Extraction mode: `lite` is the faster, cheaper read. Default: the API's standard read. */
  mode?: 'standard' | 'lite';
}

function citationsOf(response: Json): Json[] {
  const groups = (response.claim_groups as Json[] | undefined) ?? [];
  const fromGroup = groups[0]?.citations as Json[] | undefined;
  return fromGroup ?? (response.citations as Json[] | undefined) ?? [];
}

/** One citation as the source URL, stance and the passage it is bound to. */
export function summarizeCitation(citation: Json): Json {
  const passage = (citation.passage as Json | undefined)?.text ?? citation.snippet;
  const summary: Json = {
    id: citation.id,
    url: citation.url,
    title: citation.title,
    stance: citation.stance,
    passage,
  };
  return Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined && v !== null));
}

function usage(response: Json): Json {
  return (response.usage as Json | undefined) ?? {};
}

/** Check a claim against sources: a verdict, a summary and citations bound to passages. 4 credits. */
export function verifyClaimTool(client: Webcite, maxCitations = 5) {
  return tool({
    description:
      'Check whether a factual claim is supported or contradicted by sources. Returns a verdict, ' +
      'a short summary and citations, each with its URL, stance and the source passage it rests on.',
    inputSchema: z.object({
      claim: z.string().min(1).describe('One factual statement to check, in plain language.'),
      sourceUrls: z
        .array(z.string().url())
        .optional()
        .describe('Optional URLs to check the claim against instead of searching the web.'),
    }),
    execute: async ({ claim, sourceUrls }) => {
      const response = (await client.verify(claim, sourceUrls?.length ? { source_urls: sourceUrls } : {})) as Json;
      const group = ((response.claim_groups as Json[] | undefined) ?? [])[0] ?? {};
      const verdict = (group.verdict as Json | undefined) ?? {};
      return {
        claim,
        verdict: verdict.result,
        summary: verdict.summary,
        citations: citationsOf(response).slice(0, maxCitations).map(summarizeCitation),
        credits: usage(response).credits,
      };
    },
  });
}

/** Find sources for a query, with the matching passage. 2 credits per search. */
export function searchSourcesTool(client: Webcite) {
  return tool({
    description:
      'Search for sources relevant to a query. Returns sources with URL, title and the matching ' +
      'passage. Use it to find evidence before writing or citing.',
    inputSchema: z.object({
      query: z.string().min(1).describe('What to find sources for.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of sources.'),
    }),
    execute: async ({ query, limit }) => {
      const response = (await client.search(query, limit ? { limit } : {})) as Json;
      const found = citationsOf(response).map(summarizeCitation);
      return { sources: limit ? found.slice(0, limit) : found, credits: usage(response).credits };
    },
  });
}

/** Read a document at a URL into Markdown. Metered per page at cost. */
export function extractDocumentTool(client: Webcite, options: { maxChars?: number; mode?: 'standard' | 'lite' } = {}) {
  const maxChars = options.maxChars ?? 50_000;
  return tool({
    description:
      'Read a document (PDF, scan, image, spreadsheet, DOCX, PPTX) from a direct URL and return its ' +
      'text as Markdown with tables kept as tables, plus the extraction state, page count and credits.',
    inputSchema: z.object({
      url: z.string().url().describe('Direct HTTPS URL of the document.'),
    }),
    execute: async ({ url }) => {
      const response = (await client.extract({ asset_url: url, ...(options.mode ? { mode: options.mode } : {}) })) as Json;
      const markdown = String(response.markdown ?? '');
      const truncated = markdown.length > maxChars;
      const result: Json = {
        state: response.state,
        reason: response.reason ?? undefined,
        pages: usage(response).pages,
        credits: usage(response).credits,
        truncatedToChars: truncated ? maxChars : undefined,
        markdown: truncated ? markdown.slice(0, maxChars) : markdown,
      };
      return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined && v !== null));
    },
  });
}

/**
 * The three Webcite tools sharing one client. The API key defaults to `WEBCITE_API_KEY`.
 *
 * ```ts
 * const { text } = await generateText({ model, tools: webciteTools(), prompt });
 * ```
 */
export function webciteTools(options: WebciteToolsOptions = {}) {
  const { client: given, maxCitations, maxChars, mode, ...clientOptions } = options;
  const client = given ?? new Webcite(clientOptions);
  return {
    verifyClaim: verifyClaimTool(client, maxCitations),
    searchSources: searchSourcesTool(client),
    extractDocument: extractDocumentTool(client, { maxChars, mode }),
  };
}
