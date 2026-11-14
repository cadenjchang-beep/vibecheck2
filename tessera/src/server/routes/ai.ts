import {
  aiExplainSchema,
  aiGenerateFileFieldsSchema,
  aiGenerateTextSchema,
  aiSuggestSchema,
  type AiDistractorsResponse,
  type AiGenerateResponse,
  type AiTextResponse,
} from '@shared/ai';
import { LIMITS } from '@shared/constants';
import { Hono } from 'hono';
import { optionalViewer, parseJson, parseWith, requireViewer, type AppEnv } from '../http/context';
import { badRequest } from '../http/errors';
import { getAiUsage, getDistractors, withAllowance, writeDistractors } from '../services/ai';
import type { GenerateSource, ImageMediaType } from '../services/ai/provider';
import { sniffMedia } from '../services/media';
import { loadViewableSet } from '../services/policies';

const MAX_LEN = 200;

function tidy(cards: { term: string; definition: string }[]) {
  const seen = new Set<string>();
  return cards
    .map((c) => ({ term: c.term.trim().slice(0, LIMITS.cardSideMax), definition: c.definition.trim().slice(0, LIMITS.cardSideMax) }))
    .filter((c) => {
      const key = c.term.toLowerCase();
      if (!c.term || !c.definition || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fileSource(file: File): Promise<GenerateSource> {
  if (file.size === 0) throw badRequest('empty_file', 'That file is empty.');
  if (file.size > LIMITS.aiUploadBytes) throw badRequest('file_too_large', 'Use a file under 8 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.slice(0, MAX_LEN) || 'file';
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-') return { kind: 'pdf', data: bytes, name };
  const sniffed = sniffMedia(bytes);
  if (sniffed?.kind === 'image') return { kind: 'image', data: bytes, mediaType: sniffed.mime as ImageMediaType, name };
  throw badRequest('unsupported_file', 'Use a PDF or a PNG, JPEG, WebP or GIF image.');
}

export const aiRoutes = new Hono<AppEnv>()
  .get('/usage', async (c) => c.json(await getAiUsage(requireViewer(c))))

  .post('/generate', async (c) => {
    const viewer = requireViewer(c);
    let source: GenerateSource;
    let fields: { count: number; termLang?: string; definitionLang?: string };
    if ((c.req.header('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await c.req.parseBody();
      if (!(form.file instanceof File)) throw badRequest('validation_error', 'Choose a file.');
      fields = parseWith(aiGenerateFileFieldsSchema, {
        count: form.count,
        termLang: typeof form.termLang === 'string' ? form.termLang : undefined,
        definitionLang: typeof form.definitionLang === 'string' ? form.definitionLang : undefined,
      });
      source = await fileSource(form.file);
    } else {
      const input = await parseJson(c, aiGenerateTextSchema);
      fields = input;
      source = { kind: input.source, text: input.text };
    }
    const language = viewer.locale || 'en';
    const result = await withAllowance(viewer, `generate_${source.kind}`, (provider) =>
      provider.generateCards({
        source,
        count: fields.count,
        termLanguage: fields.termLang || language,
        definitionLanguage: fields.definitionLang || language,
      }),
    );
    const body: AiGenerateResponse = { title: result.title, cards: tidy(result.cards).slice(0, fields.count), usage: result.usage };
    return c.json(body);
  })

  .post('/suggest', async (c) => {
    const viewer = requireViewer(c);
    const input = await parseJson(c, aiSuggestSchema);
    const language = viewer.locale || 'en';
    const result = await withAllowance(viewer, `suggest_${input.kind}`, (provider) =>
      provider.suggest({
        kind: input.kind,
        term: input.term,
        definition: input.definition,
        setTitle: input.setTitle,
        termLanguage: input.termLang || language,
        definitionLanguage: input.definitionLang || language,
      }),
    );
    const body: AiTextResponse = { text: result.text.slice(0, LIMITS.cardSideMax), usage: result.usage };
    return c.json(body);
  })

  .post('/explain', async (c) => {
    const viewer = requireViewer(c);
    const input = await parseJson(c, aiExplainSchema);
    const { set } = await loadViewableSet(viewer, input.setId);
    const result = await withAllowance(viewer, 'explain', (provider) =>
      provider.explain({
        term: input.term,
        definition: input.definition,
        given: input.given,
        answerSide: input.answerSide,
        setTitle: set.title,
        language: viewer.locale || set.definitionLang,
      }),
    );
    const body: AiTextResponse = { text: result.text, usage: result.usage };
    return c.json(body);
  })

  .get('/distractors/:setId', async (c) => {
    const body: AiDistractorsResponse = await getDistractors(optionalViewer(c), c.req.param('setId'));
    return c.json(body);
  })

  .post('/distractors/:setId', async (c) => {
    const body: AiDistractorsResponse = await writeDistractors(requireViewer(c), c.req.param('setId'));
    return c.json(body);
  });
