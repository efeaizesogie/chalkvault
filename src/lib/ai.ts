import { getGenerativeModel, InferenceMode, InferenceSource, Schema, type GenerativeModel, type Part } from 'firebase/ai';
import { getFirebaseAI, SetupError } from './firebase';
export { SetupError };
import { redact, restore, STUDENT_TOKEN, type Redaction } from './redact';
import { SUPPORT_FLAGS, type Draft, type Pronoun, type Source, type SupportFlag } from '../data/types';

// ---------- On-device status ----------

export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api';

const createOptions = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }, { type: 'image' as const }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

interface LanguageModelStatic {
  availability(o?: unknown): Promise<Exclude<DeviceStatus, 'no-api'>>;
}
const LM = () => (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

export async function deviceStatus(): Promise<DeviceStatus> {
  const lm = LM();
  if (!lm) return 'no-api';
  try {
    return await lm.availability(createOptions);
  } catch {
    return 'unavailable';
  }
}

// ---------- Models ----------

const DRAFT_FIELDS = ['strength', 'growthArea', 'nextStep', 'comment'] as const;

// JSON Schema for Gemini Nano's structured output (Prompt API responseConstraint).
const draftJsonSchema = {
  type: 'object',
  properties: {
    strength: { type: 'string', description: 'One specific strength drawn from the notes.' },
    growthArea: { type: 'string', description: 'One honest area to grow, phrased constructively.' },
    nextStep: { type: 'string', description: 'One concrete action for next term.' },
    comment: { type: 'string', description: 'The finished report comment, 3 to 4 sentences.' },
    supportFlag: { type: 'string', enum: ['none', 'academic', 'attendance', 'wellbeing'], description: 'Whether the notes suggest the student needs follow-up.' },
  },
  required: [...DRAFT_FIELDS, 'supportFlag'],
  additionalProperties: false,
};

// The same shape for the cloud model (Gemini responseSchema).
const draftCloudSchema = Schema.object({
  properties: {
    strength: Schema.string(),
    growthArea: Schema.string(),
    nextStep: Schema.string(),
    comment: Schema.string(),
    supportFlag: Schema.enumString({ enum: ['none', 'academic', 'attendance', 'wellbeing'] }),
  },
  propertyOrdering: ['strength', 'growthArea', 'nextStep', 'comment', 'supportFlag'],
});

const alignCloudSchema = Schema.object({
  properties: {
    comment: Schema.string(),
    standards: Schema.array({ items: Schema.string() }),
  },
});


function ai() {
  const a = getFirebaseAI();
  if (!a) throw new SetupError();
  return a;
}

export class PrivacyBlock extends Error {}

// Cloud models, in order. If the first is overloaded, the next one is tried.
const CLOUD_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
type Kind = 'comment' | 'json' | 'text';
const models = new Map<string, GenerativeModel>();

function model(kind: Kind, cloudModel: string): GenerativeModel {
  const key = `${kind}:${cloudModel}`;
  let m = models.get(key);
  if (m) return m;
  if (kind === 'comment') {
    /** Hybrid model: Gemini Nano in Chrome when available, Gemini in the cloud otherwise. */
    m = getGenerativeModel(ai(), {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions, promptOptions: { responseConstraint: draftJsonSchema } },
      inCloudParams: {
        model: cloudModel,
        generationConfig: { responseMimeType: 'application/json', responseSchema: draftCloudSchema, temperature: 0.6 },
      },
    });
  } else {
    m = getGenerativeModel(ai(), {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: cloudModel,
        generationConfig:
          kind === 'json'
            ? { responseMimeType: 'application/json', responseSchema: alignCloudSchema, temperature: 0.3 }
            : { temperature: 0.3 },
      },
    });
  }
  models.set(key, m);
  return m;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msgOf = (e: unknown) => (e as Error)?.message ?? String(e);
const isBusy = (e: unknown) => /\b(500|503|429)\b|high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msgOf(e));
const isMissingModel = (e: unknown) => /\b404\b|not found|is not supported/i.test(msgOf(e));

/** Call the model, retrying briefly when the cloud is busy and falling back to the next cloud model. */
async function generate(kind: Kind, request: Parameters<GenerativeModel['generateContent']>[0]) {
  let last: unknown;
  for (const name of CLOUD_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await model(kind, name).generateContent(request);
      } catch (e) {
        last = e;
        if (isMissingModel(e)) break;
        if (!isBusy(e)) throw e;
        await sleep(1200 * (attempt + 1));
      }
    }
  }
  throw last;
}

/**
 * Streaming version: emits the text so far as it arrives (on-device or cloud).
 * Retries and model fallback only happen before the first chunk, so nothing is duplicated.
 */
async function generateStream(kind: Kind, request: Parameters<GenerativeModel['generateContentStream']>[0], onText: (soFar: string) => void) {
  let last: unknown;
  for (const name of CLOUD_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let started = false;
      try {
        const res = await model(kind, name).generateContentStream(request);
        let text = '';
        for await (const chunk of res.stream) {
          started = true;
          text += chunk.text();
          onText(text);
        }
        const final = await res.response;
        return { text: text || final.text(), inferenceSource: final.inferenceSource };
      } catch (e) {
        last = e;
        if (started) throw e;
        if (isMissingModel(e)) break;
        if (!isBusy(e)) throw e;
        await sleep(1200 * (attempt + 1));
      }
    }
  }
  throw last;
}

export type PartialDraft = Partial<Record<(typeof DRAFT_FIELDS)[number], string>>;

/** Pull the (possibly unfinished) fields out of streaming JSON, for a live preview. */
export function partialDraft(json: string): PartialDraft {
  const out: PartialDraft = {};
  for (const f of DRAFT_FIELDS) {
    const m = json.match(new RegExp('"' + f + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)'));
    if (m) out[f] = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return out;
}

/** Start (or finish) the Gemini Nano download from a user click. */
export async function downloadDeviceModel(onProgress: (p: number) => void) {
  await model('comment', CLOUD_MODELS[0]).initializeDeviceModel((p: number) => onProgress(p));
}

// ---------- Comment writing ----------

export const TONES = ['Warm', 'Balanced', 'Formal', 'Encouraging but direct'] as const;
export const LEVELS = [
  { id: 'plain', label: 'Plain English', hint: 'short sentences, everyday words, about a 6th-grade reading level' },
  { id: 'standard', label: 'Standard', hint: 'clear, professional school-report language' },
  { id: 'formal', label: 'Formal', hint: 'formal register suitable for an official transcript' },
] as const;

const MAX_NOTES = 2400; // keeps the whole prompt well under Gemini Nano's 9,216-token limit

export interface CommentRequest {
  name: string;
  pronoun: Pronoun;
  notes: string;
  subject: string;
  term: string;
  tone: string;
  level: string;
  roster: string[];
  image?: { base64: string; mimeType: 'image/jpeg' | 'image/png' };
  allowCloudFallback: boolean;
  /** Facts from the school's own records (scores, attendance). No names; safe on both paths. */
  facts?: string;
  /** Live preview of the comment as it streams in. */
  onPartial?: (draft: PartialDraft, source: 'on_device' | 'in_cloud') => void;
}

export interface CommentResult {
  draft: Draft;
  /** What actually left the device (null when everything stayed local). */
  sent: Redaction | null;
  ms: number;
}

const pronounText: Record<Pronoun, string> = { she: 'she/her', he: 'he/him', they: 'they/them' };

function buildPrompt(r: CommentRequest, name: string, notes: string, withImage: boolean) {
  const level = LEVELS.find((l) => l.id === r.level) ?? LEVELS[1];
  return [
    'You help a teacher write one end-of-term school report comment for parents.',
    `Student: ${name} (pronouns ${pronounText[r.pronoun]}). Class: ${r.subject || 'general'}${r.term ? `, ${r.term}` : ''}.`,
    `Tone: ${r.tone}. Language: ${level.hint}.`,
    "The teacher's notes are rough private shorthand and may be blunt. Never repeat harsh or labelling words; reframe them kindly but honestly. Do not invent achievements, grades or events that are not in the notes. Never mention other students by name.",
    withImage ? 'A photo of the teacher\'s handwritten notes about this student is attached. Read it as part of the notes.' : '',
    r.facts ? `Facts from the school's records (use them accurately; do not change any number): ${r.facts}` : '',
    `Notes:\n"""\n${notes.slice(0, MAX_NOTES) || '(see photo)'}\n"""`,
    `Return JSON with: strength (one full sentence: a specific strength from the notes), growthArea (one full sentence: an honest area to grow, phrased constructively), nextStep (one full sentence: a concrete thing to do next term), comment (3 to 4 sentences, under 90 words, written in the third person for parents to read, with no greeting, no sign-off and no praise that is not in the notes, refers to the student as ${name === STUDENT_TOKEN ? STUDENT_TOKEN : `"${name.split(/\s+/)[0]}"`}, weaving the three together), supportFlag (one of none, academic, attendance, wellbeing: the main kind of follow-up the notes suggest this student needs, or none).`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function writeComment(r: CommentRequest): Promise<CommentResult> {
  const status = await deviceStatus();
  const local = status === 'available';
  const t0 = performance.now();

  let prompt: string;
  let sent: Redaction | null = null;
  const parts: Part[] = [];

  if (local) {
    // Gemini Nano is ready: the real name, the raw notes and any photo stay on this device.
    prompt = buildPrompt(r, r.name, r.notes, !!r.image);
    parts.push({ type: 'text', text: prompt });
    if (r.image) parts.push({ type: 'inlineData', inlineData: { data: r.image.base64, mimeType: r.image.mimeType } });
  } else {
    if (!r.allowCloudFallback) {
      throw new PrivacyBlock('On-device AI is not ready on this computer, and cloud fallback is switched off.');
    }
    if (r.image) {
      throw new PrivacyBlock('Photos are only read on-device, because a photo can contain names that cannot be removed. Type the notes instead, or use a Chrome with Gemini Nano.');
    }
    // Cloud fallback: de-identify locally first. Only placeholders leave the device.
    const red = redact(r.notes.slice(0, MAX_NOTES), r.name, r.roster);
    prompt = buildPrompt(r, STUDENT_TOKEN, red.text, false);
    sent = { text: prompt, removed: red.removed };
    parts.push({ type: 'text', text: prompt });
  }

  const fix = (s: string) => (sent ? restore(s, r.name) : s);
  const expected: 'on_device' | 'in_cloud' = local ? 'on_device' : 'in_cloud';
  const result = await generateStream('comment', parts, (soFar) => {
    const d = partialDraft(soFar);
    r.onPartial?.(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, fix(v ?? '')])) as PartialDraft, expected);
  });
  const source: Source = result.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device';
  if (local && source === 'in_cloud') {
    // Should be impossible (availability was checked), but never hide it if it happens.
    console.warn('Request was routed to the cloud despite on-device availability.');
  }
  const data = parseDraft(result.text);
  return {
    draft: {
      strength: fix(data.strength),
      growthArea: fix(data.growthArea),
      nextStep: fix(data.nextStep),
      comment: fix(data.comment),
      supportFlag: data.supportFlag,
      source,
      tone: r.tone,
      level: r.level,
      updatedAt: Date.now(),
    },
    sent,
    ms: performance.now() - t0,
  };
}

function parseDraft(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const obj = JSON.parse(cleaned) as Record<string, unknown>;
  const out = {} as Record<(typeof DRAFT_FIELDS)[number], string>;
  for (const f of DRAFT_FIELDS) out[f] = String(obj[f] ?? '').trim();
  if (!out.comment) throw new Error('The model returned an empty comment. Try again.');
  const flag = String(obj.supportFlag ?? 'none') as SupportFlag;
  return { ...out, supportFlag: (SUPPORT_FLAGS as readonly string[]).includes(flag) ? flag : 'none' };
}

// ---------- Register photo (on-device only) ----------

const registerSchema = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The student name exactly as it appears on the class list.' },
          mark: { type: 'string', enum: ['P', 'L', 'A'], description: 'P present, L late, A absent.' },
        },
        required: ['name', 'mark'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
};

let registerModel: GenerativeModel | null = null;

/**
 * Reads a photo of a handwritten register with Gemini Nano. ONLY_ON_DEVICE: a register shows
 * every child's name, so the photo is never sent to the cloud, not even with names removed.
 */
export async function readRegister(image: { base64: string; mimeType: 'image/jpeg' | 'image/png' }, roster: string[], date: string) {
  if ((await deviceStatus()) !== 'available') {
    throw new PrivacyBlock('Reading a register photo needs Gemini Nano on this computer. The photo shows children’s names, so Chalkvault never sends it to the cloud.');
  }
  registerModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: registerSchema } },
  });
  const t0 = performance.now();
  const prompt = [
    `This is a photo of a handwritten class attendance register. Read the marks for ${date} (or the most recent column if dates are unclear).`,
    'Class list:',
    ...roster.map((n, i) => `${i + 1}. ${n}`),
    'For each student on the class list, give their mark: P if present (a tick, P, / or a dot), L if late (L), A if absent (a cross, A, O or empty).',
    'Use the names exactly as written in the class list. Skip anyone you cannot find in the photo.',
  ].join('\n');
  const res = await registerModel.generateContent([
      { type: 'text', text: prompt },
      { type: 'inlineData', inlineData: { data: image.base64, mimeType: image.mimeType } },
    ]);
  const obj = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, '')) as { rows?: { name: string; mark: 'P' | 'L' | 'A' }[] };
  return { rows: obj.rows ?? [], ms: performance.now() - t0 };
}

// ---------- Cloud-only tools (always de-identified first) ----------

export function prepareOutbound(comment: string, name: string, roster: string[]) {
  return redact(comment, name, roster);
}

export const LANGUAGES = ['Yoruba', 'Hausa', 'Igbo', 'Spanish', 'French', 'Portuguese', 'Arabic', 'Mandarin Chinese', 'Haitian Creole', 'Vietnamese'];

/** Languages Gemini Nano can write on-device (Prompt API expectedOutputs). Others go to the cloud, de-identified. */
export const ON_DEVICE_LANGUAGES: Record<string, string> = { French: 'fr', Spanish: 'es', German: 'de', Japanese: 'ja' };
const translateModels = new Map<string, GenerativeModel>();

/** Translate on this device. The comment keeps the real name because nothing leaves the computer. */
export async function translateOnDevice(text: string, language: string) {
  const code = ON_DEVICE_LANGUAGES[language];
  if (!code) throw new Error(`${language} can’t be written on-device.`);
  let m = translateModels.get(code);
  if (!m) {
    m = getGenerativeModel(ai(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: [code] }] } },
    });
    translateModels.set(code, m);
  }
  const t0 = performance.now();
  const prompt = [
    `Translate this school report comment for a parent into ${language}.`,
    'Keep the meaning and warmth; use natural, respectful wording a parent would use. Keep names unchanged. Return only the translation.',
    `"""\n${text}\n"""`,
  ].join('\n');
  const res = await m.generateContent(prompt);
  return { text: res.response.text().trim(), ms: performance.now() - t0 };
}

export async function translateTemplate(deidentified: string, language: string) {
  const t0 = performance.now();
  const prompt = [
    `Translate this school report comment for a parent into ${language}.`,
    `Keep the placeholder ${STUDENT_TOKEN} exactly as written (it will be replaced with the child's name later). Keep the meaning and warmth; use natural, respectful wording a parent would use.`,
    'Return only the translation.',
    `"""\n${deidentified}\n"""`,
  ].join('\n');
  const res = await generate('text', prompt);
  return { text: res.response.text().trim(), prompt, ms: performance.now() - t0 };
}

export async function alignToStandards(deidentified: string, framework: string) {
  const t0 = performance.now();
  const prompt = [
    `Revise this school report comment so its wording aligns with the ${framework} curriculum standards.`,
    `Keep the same facts, length (3 to 4 sentences) and tone. Keep the placeholder ${STUDENT_TOKEN} exactly as written.`,
    'Return JSON: comment (the revised comment) and standards (2 to 3 short references to the standards you aligned to, e.g. a code and a few words).',
    `"""\n${deidentified}\n"""`,
  ].join('\n');
  const res = await generate('json', prompt);
  const obj = JSON.parse(res.response.text()) as { comment?: string; standards?: string[] };
  return { comment: String(obj.comment ?? ''), standards: obj.standards ?? [], prompt, ms: performance.now() - t0 };
}
