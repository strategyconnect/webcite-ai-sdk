# webcite-ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [Webcite](https://webcite.co), one evidence suite for
AI apps and agents: document parsing and OCR to Markdown, claim verification with verdicts,
citations bound to source passages, and source search.

| Tool | What it does | Credits |
|---|---|---|
| `verifyClaim` | Checks a claim and returns a verdict, a summary and citations with URL, stance and the source passage | 4 per claim |
| `searchSources` | Finds sources for a query, with the matching passage | 2 per search |
| `extractDocument` | Reads a PDF, scan, image, spreadsheet or office file at a URL into Markdown | Per page, at cost |

Prices are on [webcite.co/pricing](https://webcite.co/pricing). The Free plan includes 100
credits, renewing every 30 days while credits remain.

## Install

```bash
npm install webcite-ai-sdk ai zod
export WEBCITE_API_KEY=...   # create one at https://webcite.co/api-keys
```

Works with AI SDK 5, 6 and 7 and zod 3.25 or 4. Built on the official
[`webcite`](https://www.npmjs.com/package/webcite) TypeScript SDK.

## Use

```ts
import { generateText, isStepCount } from 'ai';
import { webciteTools } from 'webcite-ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-haiku-5.5',
  system: 'Check each factual claim with verifyClaim and cite the URLs it returns.',
  prompt: 'Can you see the Great Wall of China from the Moon?',
  tools: webciteTools(),
  stopWhen: isStepCount(5),
});
```

`webciteTools()` returns `{ verifyClaim, searchSources, extractDocument }` sharing one client. Pick
the ones you need, or build them one at a time with `verifyClaimTool(client)`,
`searchSourcesTool(client)` and `extractDocumentTool(client, { mode, maxChars })`.

## What the model sees

For "The Great Wall of China is visible from the Moon with the naked eye.", `verifyClaim` returns
(from the response recorded from the API on 24 November 2026,
[webcite.co/samples/claim-great-wall.json](https://webcite.co/samples/claim-great-wall.json),
shortened here):

```json
{
  "claim": "The Great Wall of China is visible from the Moon with the naked eye.",
  "verdict": "contradicted",
  "summary": "The claim that the Great Wall of China is visible from the Moon with the naked eye is false ...",
  "citations": [
    {
      "id": "1",
      "url": "https://www.nasa.gov/image-article/great-wall/",
      "title": "nasa.gov",
      "stance": "contradicts",
      "passage": "... Despite myths to the contrary, the wall isn't visible from the moon, ..."
    }
  ],
  "credits": 4
}
```

`extractDocument` returns `state`, `pages`, `credits` and `markdown`. Check `state`: anything other
than `complete` comes with a `reason` naming what was not read. Markdown longer than `maxChars`
(50,000 by default) is cut and `truncatedToChars` says so.

## Options

```ts
webciteTools({
  apiKey: process.env.WEBCITE_API_KEY, // default
  maxCitations: 5,                     // citations per verification returned to the model
  maxChars: 50_000,                    // Markdown characters per document
  mode: 'lite',                        // faster, cheaper extraction
});
```

Any other option is passed to the `webcite` client (`baseUrl`, `timeout`, `maxRetries`, `fetch`), or pass
`client` to reuse one you already have.

The same capabilities are also available to any MCP client from the hosted server at
`https://api.webcite.co/mcp` (OAuth or API key), including through the AI SDK's MCP client.

## Development

```bash
npm install
npm run check   # typecheck, tests on recorded responses (no network), build
```

## Links

- [Webcite API reference](https://webcite.co/api-docs)
- [Webcite TypeScript SDK](https://github.com/strategyconnect/webcite-js)
- Support: support@webcite.co

MIT licensed.
