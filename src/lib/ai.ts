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

// ---------- Score sheets: scan a photo, or map a CBT export's columns ----------

export interface ScannedRow {
  name: string;
  scores: Record<string, number>;
}

/**
 * Read a photographed score sheet into the school's own columns.
 * On-device (ONLY_ON_DEVICE) by default, because a score sheet shows names. The cloud is used only
 * when the school's admin has switched on cloud scanning, and the ledger records that names were sent.
 */
export async function readScoreSheet(
  image: { base64: string; mimeType: 'image/jpeg' | 'image/png' },
  roster: string[],
  columns: { key: string; label: string; max: number }[],
  allowCloud: boolean,
) {
  const local = (await deviceStatus()) === 'available';
  if (!local && !allowCloud) {
    throw new PrivacyBlock('Reading a score sheet needs Gemini Nano on this computer, because the sheet shows students’ names. An admin can allow cloud reading in Settings.');
  }
  const schema = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ...Object.fromEntries(columns.map((c) => [c.key, { type: 'number', description: `${c.label}, out of ${c.max}` }])),
          },
          required: ['name'],
        },
      },
    },
    required: ['rows'],
  };
  const prompt = [
    'This is a photo of a teacher’s handwritten or printed score sheet.',
    `Columns to read: ${columns.map((c) => `${c.key} = "${c.label}" (out of ${c.max})`).join('; ')}.`,
    'Students on the class list:',
    ...roster.map((n, i) => `${i + 1}. ${n}`),
    'For each student you can find on the sheet, return their name exactly as written in the class list and each score as a number. Leave out a score you cannot read. Do not guess.',
  ].join('\n');
  const m = getGenerativeModel(ai(), local
    ? { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions, promptOptions: { responseConstraint: schema } } }
    : { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { responseMimeType: 'application/json', temperature: 0 } } });
  const t0 = performance.now();
  const res = await m.generateContent([
    { type: 'text', text: prompt },
    { type: 'inlineData', inlineData: { data: image.base64, mimeType: image.mimeType } },
  ]);
  const raw = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, '')) as { rows?: Record<string, unknown>[] };
  const rows: ScannedRow[] = (raw.rows ?? []).map((r) => ({
    name: String(r.name ?? ''),
    scores: Object.fromEntries(columns.filter((c) => typeof r[c.key] === 'number').map((c) => [c.key, Math.min(c.max, Math.max(0, r[c.key] as number))])),
  }));
  return { rows, source: (local ? 'on_device' : 'in_cloud') as Source, ms: performance.now() - t0 };
}

/**
 * Match a CBT export's column headers to the school's score-sheet columns. Only the header row is sent,
 * never a student's row, so this is safe whichever way PREFER_ON_DEVICE routes it.
 */
export async function mapColumns(headers: string[], columns: { key: string; label: string; max: number }[]) {
  const schema = {
    type: 'object',
    properties: {
      nameColumn: { type: 'string', description: 'Header holding the student name, or empty.' },
      idColumn: { type: 'string', description: 'Header holding the admission or registration number, or empty.' },
      ...Object.fromEntries(columns.map((c) => [c.key, { type: 'string', description: `Header for "${c.label}", or empty.` }])),
    },
    required: ['nameColumn', 'idColumn', ...columns.map((c) => c.key)],
  };
  const m = getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }, promptOptions: { responseConstraint: schema } },
    inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { responseMimeType: 'application/json', temperature: 0 } },
  });
  const prompt = [
    'A school exported results from a computer-based test (CBT) system. These are the column headers:',
    headers.map((h) => `"${h}"`).join(', '),
    `The school's score sheet has these columns: ${columns.map((c) => `${c.key} = "${c.label}" (out of ${c.max})`).join('; ')}.`,
    'Return JSON giving, for each score-sheet column key, the exact header that holds it (or "" if none), plus nameColumn and idColumn.',
  ].join('\n');
  const res = await m.generateContent(prompt);
  const obj = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, '')) as Record<string, string>;
  const pick = (h: string | undefined) => (h && headers.includes(h) ? h : '');
  return {
    nameColumn: pick(obj.nameColumn),
    idColumn: pick(obj.idColumn),
    map: Object.fromEntries(columns.map((c) => [c.key, pick(obj[c.key])])) as Record<string, string>,
    source: (res.response.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device') as Source,
  };
}

// ---------- Lesson notes and quizzes: no student data, hybrid ----------

let lessonModel: GenerativeModel | null = null;
const quizModels = new Map<number, GenerativeModel>();

/** Stream a lesson note (objectives, content, activities, evaluation). No student data; PREFER_ON_DEVICE. */
export async function writeLessonNote(o: { subject: string; level: string; topic: string; week: string; country: string; extra: string }, onText: (t: string, s: Source) => void) {
  lessonModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] } },
    inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { temperature: 0.5 } },
  });
  const local = (await deviceStatus()) === 'available';
  const prompt = [
    `Write a lesson note for ${o.subject}, ${o.level}${o.country === 'Nigeria' ? ' (Nigerian NERDC scheme of work)' : ''}. Topic: ${o.topic}.${o.week ? ` Week ${o.week}.` : ''}`,
    o.extra ? `Teacher’s notes: ${o.extra.slice(0, 600)}` : '',
    'Use these plain headings on their own lines: Objectives, Instructional materials, Introduction, Lesson content, Class activity, Evaluation, Assignment.',
    'Under Objectives, write 3 lines starting "By the end of the lesson, students should be able to". Keep the whole note under 450 words, in clear English suited to the class. Use local, everyday Nigerian examples where they help. No markdown symbols.',
  ]
    .filter(Boolean)
    .join('\n');
  const t0 = performance.now();
  const res = await lessonModel.generateContentStream(prompt);
  let text = '';
  for await (const c of res.stream) {
    text += c.text();
    onText(text, local ? 'on_device' : 'in_cloud');
  }
  const final = await res.response;
  return { text, source: (final.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device') as Source, prompt, ms: performance.now() - t0 };
}

/** Multiple-choice quiz as structured JSON (responseConstraint on-device, responseSchema in the cloud). */
export async function writeQuiz(o: { subject: string; level: string; topic: string; notes: string; count: number }) {
  let m = quizModels.get(o.count);
  if (!m) {
    const item = {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
        answer: { type: 'integer', minimum: 0, maximum: 3, description: 'Index of the correct option.' },
        explanation: { type: 'string' },
      },
      required: ['question', 'options', 'answer', 'explanation'],
    };
    const jsonSchema = { type: 'object', properties: { questions: { type: 'array', items: item, minItems: o.count, maxItems: o.count } }, required: ['questions'] };
    m = getGenerativeModel(ai(), {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }, promptOptions: { responseConstraint: jsonSchema } },
      inCloudParams: {
        model: CLOUD_MODELS[0],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: Schema.object({
            properties: {
              questions: Schema.array({
                items: Schema.object({ properties: { question: Schema.string(), options: Schema.array({ items: Schema.string() }), answer: Schema.integer(), explanation: Schema.string() } }),
              }),
            },
          }),
          temperature: 0.4,
        },
      },
    });
    quizModels.set(o.count, m);
  }
  const prompt = [
    `Write ${o.count} multiple-choice questions for ${o.subject}, ${o.level}, on "${o.topic}", suitable for a computer-based test.`,
    'Each has exactly four options, one correct answer (its index 0–3), and a one-sentence explanation. Mix easy, medium and harder questions. Vary which option is correct.',
    o.notes ? `Base them on this lesson note:\n${o.notes.slice(0, 3500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const t0 = performance.now();
  const res = await m.generateContent(prompt);
  const obj = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, '')) as { questions?: { question: string; options: string[]; answer: number; explanation: string }[] };
  const questions = (obj.questions ?? [])
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({ question: q.question, options: q.options.slice(0, 4), answer: Math.min(Math.max(0, Math.round(q.answer)), Math.min(3, q.options.length - 1)), explanation: q.explanation ?? '' }));
  return { questions, source: (res.response.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device') as Source, prompt, ms: performance.now() - t0 };
}

// ---------- Parent messages: one name-free template, translated per language, filled in locally ----------

let messageModel: GenerativeModel | null = null;

/** Draft a short parent message with placeholders. Contains no names, so PREFER_ON_DEVICE may route it either way. */
export async function draftParentMessage(kind: 'absence' | 'fees' | 'results' | 'custom', gist: string, schoolName: string) {
  messageModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] } },
    inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { temperature: 0.4 } },
  });
  const purpose = {
    absence: 'tell the parent their child was marked absent today and ask them to contact the school if they did not know',
    fees: 'politely remind the parent of the outstanding school-fees balance for this term and how to pay',
    results: 'tell the parent this term’s report card is ready and how to view it with the result PIN at the link',
    custom: 'pass on the school’s message below',
  }[kind];
  const allowed = { absence: '[GUARDIAN], [STUDENT], [CLASS], [DATE]', fees: '[GUARDIAN], [STUDENT], [CLASS], [AMOUNT]', results: '[GUARDIAN], [STUDENT], [CLASS], [PIN], [LINK]', custom: '[GUARDIAN], [STUDENT], [CLASS]' }[kind];
  const prompt = [
    `Write a short, warm, respectful text message from ${schoolName} to a parent in Nigeria, to ${purpose}.`,
    gist ? `The school’s note: ${gist.slice(0, 600)}` : '',
    `Use these placeholders exactly as written, and no real names: ${allowed}.`,
    'At most 60 words. Plain text, no emoji, no subject line. End with the school’s name.',
  ]
    .filter(Boolean)
    .join('\n');
  const t0 = performance.now();
  const res = await messageModel.generateContent(prompt);
  return {
    text: res.response.text().trim().replace(/^["“]|["”]$/g, ''),
    source: (res.response.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device') as Source,
    prompt,
    ms: performance.now() - t0,
  };
}

/** Translate a placeholder template. On-device for French, Spanish, German, Japanese; cloud for others (it carries no names). */
export async function translateMessage(template: string, language: string) {
  const code = ON_DEVICE_LANGUAGES[language];
  const local = !!code && (await deviceStatus()) === 'available';
  const prompt = [
    `Translate this text message for a parent into ${language}.`,
    'Keep every placeholder in square brackets exactly as written, untranslated. Keep it warm and respectful. Return only the translation.',
    `"""\n${template}\n"""`,
  ].join('\n');
  const t0 = performance.now();
  if (local) {
    const m = getGenerativeModel(ai(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: [code] }] } },
    });
    const res = await m.generateContent(prompt);
    return { text: res.response.text().trim(), source: 'on_device' as Source, prompt, ms: performance.now() - t0 };
  }
  const res = await generate('text', prompt);
  return { text: res.response.text().trim(), source: 'in_cloud' as Source, prompt, ms: performance.now() - t0 };
}

// ---------- Ask Chalkvault: questions about the school, answered from figures compiled in the browser ----------

let askModel: GenerativeModel | null = null;

/**
 * Answer a staff question from a brief of school figures built in the browser.
 * On-device (PREFER_ON_DEVICE, Nano available): the brief keeps real names and nothing leaves the computer.
 * Cloud fallback: every student name becomes a code like [S7] before sending, and is put back locally as the
 * answer streams in.
 */
export async function askSchool(opts: {
  question: string;
  brief: string;
  names: string[];
  history: { q: string; a: string }[];
  allowCloud: boolean;
  onText: (soFar: string, source: Source) => void;
}) {
  const local = (await deviceStatus()) === 'available';
  if (!local && !opts.allowCloud) throw new PrivacyBlock('Gemini Nano isn’t ready on this computer, and cloud help is switched off.');
  askModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] } },
    inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { temperature: 0.2 } },
  });

  // Codes for names. Full names first, then each first name and surname on its own (notes often say just "Ada"),
  // so no part of a child's name can reach the cloud. Codes are turned back into full names locally.
  const full = [...new Set(opts.names)].sort((a, b) => b.length - a.length);
  const codeOf = new Map(full.map((n, i) => [n, `[S${i + 1}]`]));
  const parts = new Map<string, string>();
  for (const n of full) for (const p of n.split(/\s+/)) if (p.length >= 3 && !parts.has(p.toLowerCase())) parts.set(p.toLowerCase(), codeOf.get(n)!);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hide = (t: string) => {
    if (local) return t;
    let out = t;
    for (const [n, c] of codeOf) out = out.split(n).join(c);
    for (const [p, c] of [...parts].sort((a, b) => b[0].length - a[0].length)) out = out.replace(new RegExp(`(?<![\\p{L}])${esc(p)}(?![\\p{L}])`, 'giu'), c);
    return out;
  };
  const show = (t: string) => {
    if (local) return t;
    let out = t;
    for (const [n, c] of codeOf) out = out.split(c).join(n);
    return out;
  };

  const brief = hide(opts.brief).slice(0, 18000); // stays well inside Gemini Nano's 9,216-token window
  const history = opts.history.slice(-2).map((h) => `Earlier question: ${hide(h.q)}\nEarlier answer: ${hide(h.a).slice(0, 600)}`).join('\n');
  const prompt = [
    'You are Chalkvault, an assistant for staff at a school. Answer the question using ONLY the school figures below.',
    'Be brief and specific: lead with the answer, then up to 5 short lines or bullet points. Name students and classes exactly as written. If the figures do not contain the answer, say what is missing. Never invent numbers.',
    local ? '' : 'Students appear as codes like [S3]; refer to them by the same codes.',
    `School figures:\n${brief}`,
    history,
    `Question: ${hide(opts.question)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const t0 = performance.now();
  let text = '';
  const source: Source = local ? 'on_device' : 'in_cloud';
  // A cloud stream now and then fails to parse before any text arrives; one quiet retry covers it.
  let final;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await askModel.generateContentStream(prompt);
      for await (const chunk of res.stream) {
        text += chunk.text();
        opts.onText(show(text), source);
      }
      final = await res.response;
      break;
    } catch (e) {
      if (attempt > 0 || text) throw e;
      text = '';
    }
  }
  const actual: Source = final.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device';
  return { answer: show(text), source: actual, sent: actual === 'in_cloud' ? prompt : '', ms: performance.now() - t0 };
}

// ---------- Payment receipts: on-device by default ----------

export interface ReadReceipt {
  payerName: string;
  amount: number;
  date: string;
  reference: string;
  bank: string;
  narration: string;
}

/**
 * Read a bank teller, transfer screenshot or POS slip. ONLY_ON_DEVICE, because receipts carry
 * parents' names and account details. The cloud is used only if the school allowed cloud scanning.
 */
export async function readReceipt(image: { base64: string; mimeType: 'image/jpeg' | 'image/png' }, allowCloud: boolean) {
  const local = (await deviceStatus()) === 'available';
  if (!local && !allowCloud) {
    throw new PrivacyBlock('Reading a receipt needs Gemini Nano on this computer, because receipts show parents’ names and account details. An admin can allow cloud reading in Settings.');
  }
  const schema = {
    type: 'object',
    properties: {
      payerName: { type: 'string', description: 'Name of the person or account that paid.' },
      amount: { type: 'number', description: 'Amount paid in naira, digits only.' },
      date: { type: 'string', description: 'Payment date as YYYY-MM-DD, or empty.' },
      reference: { type: 'string', description: 'Transaction reference or session ID, or empty.' },
      bank: { type: 'string', description: 'Bank or channel, or empty.' },
      narration: { type: 'string', description: 'Narration or description text, often the child’s name or class.' },
    },
    required: ['payerName', 'amount', 'date', 'reference', 'bank', 'narration'],
  };
  const m = getGenerativeModel(ai(), local
    ? { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions, promptOptions: { responseConstraint: schema } } }
    : { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { responseMimeType: 'application/json', temperature: 0 } } });
  const t0 = performance.now();
  const res = await m.generateContent([
    { type: 'text', text: 'This is a photo or screenshot of a school-fees payment: a bank teller, transfer receipt or POS slip from a Nigerian bank. Read the payer, the amount in naira, the date, the reference, the bank and the narration. Return JSON. Leave a field empty if it is not visible; never guess.' },
    { type: 'inlineData', inlineData: { data: image.base64, mimeType: image.mimeType } },
  ]);
  const o = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, '')) as Partial<ReadReceipt>;
  return {
    receipt: {
      payerName: String(o.payerName ?? ''),
      amount: Number(String(o.amount ?? '').replace(/[^\d.]/g, '')) || 0,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date ?? '')) ? String(o.date) : '',
      reference: String(o.reference ?? ''),
      bank: String(o.bank ?? ''),
      narration: String(o.narration ?? ''),
    },
    source: (local ? 'on_device' : 'in_cloud') as Source,
    ms: performance.now() - t0,
  };
}

// ---------- Short remarks (subject teacher, principal): hybrid, never given a name ----------

let remarkModel: GenerativeModel | null = null;

/**
 * One short report-card remark from facts and a teacher's note. Names are removed from the note
 * before the prompt is built, so the request is safe whichever way PREFER_ON_DEVICE routes it.
 */
export async function writeRemark(r: { kind: 'subject' | 'principal'; subject?: string; facts: string; note?: string; roster: string[]; studentName: string }) {
  remarkModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] } },
    inCloudParams: { model: CLOUD_MODELS[0], generationConfig: { temperature: 0.5 } },
  });
  const note = r.note ? redact(r.note.slice(0, 600), r.studentName, r.roster).text : '';
  const prompt = [
    r.kind === 'subject'
      ? `Write one short subject teacher's remark (at most 14 words) for a school report card in ${r.subject}.`
      : "Write one short principal's remark (at most 20 words) for a school report card.",
    'Write in the third person about "the student" without naming them. Be specific, warm and honest. Do not repeat the score, grade or position (they are printed beside the remark); say what they mean for the student and one thing to do next. No greeting, no exclamation marks. Do not invent facts.',
    `Facts: ${r.facts}`,
    note ? `Teacher's note (shorthand): ${note}` : '',
    'Return only the remark.',
  ]
    .filter(Boolean)
    .join('\n');
  const t0 = performance.now();
  const res = await remarkModel.generateContent(prompt);
  return {
    text: res.response.text().trim().replace(/^["“]|["”]$/g, ''),
    source: (res.response.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device') as Source,
    prompt,
    ms: performance.now() - t0,
  };
}

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

// ---------- Document import: sort a page, then read it ----------

export const PAGE_KINDS = ['class_list', 'score_sheet', 'register', 'bio_data', 'fee_ledger', 'staff_list', 'other'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  class_list: 'Class list',
  score_sheet: 'Score sheet or broadsheet',
  register: 'Attendance register',
  bio_data: 'Student bio-data form',
  fee_ledger: 'Fee ledger',
  staff_list: 'Staff list',
  other: 'Something else',
};

export interface ImportedStudent {
  name: string;
  admissionNo?: string;
  gender?: string;
  dob?: string;
  guardianName?: string;
  guardianPhone?: string;
  balance?: number;
  scores?: Record<string, number>;
  /** Fields the model could not read with confidence (common with handwriting). */
  unsure?: string[];
}
export interface ImportedStaff {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  subjects?: string[];
  classes?: string[];
}
export interface PageReading {
  kind: PageKind;
  className?: string;
  subject?: string;
  students: ImportedStudent[];
  staff: ImportedStaff[];
}

/** One page request: on the device with the schema as a constraint, or in the cloud with retries and a fallback model. */
async function askPage(local: boolean, schema: object, request: Parameters<GenerativeModel['generateContent']>[0]) {
  if (local) return getGenerativeModel(ai(), { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions, promptOptions: { responseConstraint: schema } } }).generateContent(request);
  let last: unknown;
  for (const name of CLOUD_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await getGenerativeModel(ai(), { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0 } } }).generateContent(request);
      } catch (e) {
        last = e;
        if (isMissingModel(e)) break;
        if (!isBusy(e)) throw e;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw last;
}
/** On the device the schema constrains the output; in the cloud it goes in the prompt so the keys match. */
function shapeNote(local: boolean, schema: object) {
  return local ? '' : `\n\nReply with JSON only, matching this JSON Schema exactly (same keys):\n${JSON.stringify(schema)}`;
}
function parseJson<T>(text: string): T {
  return JSON.parse(text.trim().replace(/^```(?:json)?|```$/g, '')) as T;
}

/**
 * Read one page of a school's old records. First the model sorts the page into a kind (enum output),
 * then it reads it into JSON shaped for that kind. Pages show children's names, so this runs on the device;
 * the cloud is used only when the school's admin has switched on cloud scanning.
 */
export async function readRecordPage(
  image: { base64: string; mimeType: 'image/jpeg' | 'image/png' },
  ctx: { levels: string[]; subjects: string[]; columns: { key: string; label: string; max: number }[] },
  allowCloud: boolean,
): Promise<PageReading & { source: Source; ms: number }> {
  const local = (await deviceStatus()) === 'available';
  if (!local && !allowCloud) {
    throw new PrivacyBlock('Reading old records needs Gemini Nano on this computer, because the pages show children’s names. An admin can allow cloud scanning in Settings.');
  }
  const img = { type: 'inlineData' as const, inlineData: { data: image.base64, mimeType: image.mimeType } };
  const t0 = performance.now();
  const source: Source = local ? 'on_device' : 'in_cloud';

  // 1. What kind of page is this?
  const kindSchema = { type: 'object', properties: { kind: { type: 'string', enum: [...PAGE_KINDS] } }, required: ['kind'] };
  const sort = await askPage(local, kindSchema, [
    {
      type: 'text',
      text: [
        'This is a photo or scan of one page of a school’s records. Say what kind of page it is.',
        'class_list: a list of pupils in a class, maybe with admission numbers or parents.',
        'score_sheet: marks or scores per pupil, e.g. CA, test, exam, total, or a broadsheet of subjects.',
        'register: a daily attendance register with ticks or marks per day.',
        'bio_data: an admission or bio-data form about one or more pupils (date of birth, parent, address).',
        'fee_ledger: fees, payments or balances per pupil.',
        'staff_list: a list of teachers or staff.',
        'other: anything else.',
        shapeNote(local, kindSchema),
      ].join('\n'),
    },
    img,
  ]);
  const sorted = parseJson<{ kind?: string }>(sort.response.text()).kind ?? 'other';
  const kind: PageKind = (PAGE_KINDS as readonly string[]).includes(sorted) ? (sorted as PageKind) : 'other';
  if (kind === 'other') return { kind, students: [], staff: [], source, ms: performance.now() - t0 };

  // 2. Read it, in the shape that kind needs.
  const unsure = { type: 'array', items: { type: 'string' }, description: 'Names of fields you could not read clearly.' };
  const scoreProps = Object.fromEntries(ctx.columns.map((c) => [c.key, { type: 'number', description: `${c.label}, out of ${c.max}` }]));
  const studentProps: Record<string, object> = { name: { type: 'string' }, admissionNo: { type: 'string' }, unsure };
  if (kind === 'class_list' || kind === 'bio_data') Object.assign(studentProps, { gender: { type: 'string', enum: ['male', 'female', ''] }, guardianName: { type: 'string' }, guardianPhone: { type: 'string' } });
  if (kind === 'bio_data') Object.assign(studentProps, { dob: { type: 'string', description: 'Date of birth as YYYY-MM-DD' } });
  if (kind === 'fee_ledger') Object.assign(studentProps, { balance: { type: 'number', description: 'Amount still owed in naira' } });
  if (kind === 'score_sheet') Object.assign(studentProps, { scores: { type: 'object', properties: scoreProps } });
  const staffItem = { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, subjects: { type: 'array', items: { type: 'string' } }, classes: { type: 'array', items: { type: 'string' } } }, required: ['name'] };
  const schema =
    kind === 'staff_list'
      ? { type: 'object', properties: { staff: { type: 'array', items: staffItem } }, required: ['staff'] }
      : {
          type: 'object',
          properties: {
            className: { type: 'string', description: 'The class or arm written on the page, e.g. JSS 1A, or empty.' },
            ...(kind === 'score_sheet' ? { subject: { type: 'string', description: 'The subject, or empty for a broadsheet.' } } : {}),
            students: { type: 'array', items: { type: 'object', properties: studentProps, required: ['name'] } },
          },
          required: ['className', 'students'],
        };
  const guide = [
    `This page is a ${PAGE_KIND_LABEL[kind].toLowerCase()} from a school. Copy what is written on it into JSON.`,
    `The school’s class levels: ${ctx.levels.join(', ')}. Its subjects: ${ctx.subjects.join(', ')}.`,
    kind === 'score_sheet' ? `Score columns: ${ctx.columns.map((c) => `${c.key} = "${c.label}" (out of ${c.max})`).join('; ')}. Match the sheet’s columns to these; leave out a column the sheet does not have.` : '',
    'Copy names exactly as written. Phone numbers as written. Leave a field out if it is not on the page. Never guess: if handwriting is unclear, give your best reading and add the field name to "unsure".',
  ]
    .filter(Boolean)
    .join('\n');
  const read = await askPage(local, schema, [{ type: 'text', text: guide + shapeNote(local, schema) }, img]);
  const raw = parseJson<{ className?: string; subject?: string; students?: ImportedStudent[]; staff?: ImportedStaff[] }>(read.response.text());
  const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
  const students = (raw.students ?? [])
    .filter((s) => clean(s.name))
    .map((s) => ({
      ...s,
      name: clean(s.name).replace(/\s+/g, ' '),
      scores: s.scores ? Object.fromEntries(ctx.columns.filter((c) => typeof s.scores?.[c.key] === 'number').map((c) => [c.key, Math.min(c.max, Math.max(0, s.scores![c.key]))])) : undefined,
    }));
  return { kind, className: clean(raw.className), subject: clean(raw.subject), students, staff: (raw.staff ?? []).filter((s) => clean(s.name)), source, ms: performance.now() - t0 };
}
