import { getGenerativeModel, InferenceMode, InferenceSource, Schema, type GenerativeModel, type Part } from 'firebase/ai';
import { getFirebaseAI } from './firebase';
import { redact, restore, STUDENT_TOKEN, type Redaction } from './redact';
import type { Draft, Pronoun, Source } from './db';

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
  },
  required: [...DRAFT_FIELDS],
  additionalProperties: false,
};

// The same shape for the cloud model (Gemini responseSchema).
const draftCloudSchema = Schema.object({
  properties: {
    strength: Schema.string(),
    growthArea: Schema.string(),
    nextStep: Schema.string(),
    comment: Schema.string(),
  },
});

const alignCloudSchema = Schema.object({
  properties: {
    comment: Schema.string(),
    standards: Schema.array({ items: Schema.string() }),
  },
});

let commentModel: GenerativeModel | null = null;
let cloudJsonModel: GenerativeModel | null = null;
let cloudTextModel: GenerativeModel | null = null;

function ai() {
  const a = getFirebaseAI();
  if (!a) throw new SetupError();
  return a;
}

export class SetupError extends Error {
  constructor() {
    super('Firebase is not configured yet. Add your project values in src/firebase-config.ts.');
  }
}
export class PrivacyBlock extends Error {}

/** Hybrid model: Gemini Nano in Chrome when available, Gemini in the cloud otherwise. */
function getCommentModel() {
  commentModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: draftJsonSchema } },
    inCloudParams: {
      model: 'gemini-3.5-flash-lite',
      generationConfig: { responseMimeType: 'application/json', responseSchema: draftCloudSchema, temperature: 0.6 },
    },
  });
  return commentModel;
}
function getCloudJson() {
  cloudJsonModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: 'gemini-3.5-flash-lite',
      generationConfig: { responseMimeType: 'application/json', responseSchema: alignCloudSchema, temperature: 0.3 },
    },
  });
  return cloudJsonModel;
}
function getCloudText() {
  cloudTextModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: 'gemini-3.5-flash-lite', generationConfig: { temperature: 0.3 } },
  });
  return cloudTextModel;
}

/** Start (or finish) the Gemini Nano download from a user click. */
export async function downloadDeviceModel(onProgress: (p: number) => void) {
  await getCommentModel().initializeDeviceModel((p: number) => onProgress(p));
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
    `Notes:\n"""\n${notes.slice(0, MAX_NOTES) || '(see photo)'}\n"""`,
    `Return JSON with: strength (one full sentence: a specific strength from the notes), growthArea (one full sentence: an honest area to grow, phrased constructively), nextStep (one full sentence: a concrete thing to do next term), comment (3 to 4 sentences, under 90 words, written in the third person for parents to read, with no greeting, no sign-off and no praise that is not in the notes, refers to the student as ${name === STUDENT_TOKEN ? STUDENT_TOKEN : `"${name.split(/\s+/)[0]}"`}, weaving the three together).`,
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

  const result = await getCommentModel().generateContent(parts);
  const source: Source = result.response.inferenceSource === InferenceSource.IN_CLOUD ? 'in_cloud' : 'on_device';
  if (local && source === 'in_cloud') {
    // Should be impossible (availability was checked), but never hide it if it happens.
    console.warn('Request was routed to the cloud despite on-device availability.');
  }
  const data = parseDraft(result.response.text());
  const fix = (s: string) => (sent ? restore(s, r.name) : s);
  return {
    draft: {
      strength: fix(data.strength),
      growthArea: fix(data.growthArea),
      nextStep: fix(data.nextStep),
      comment: fix(data.comment),
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
  return out;
}

// ---------- Cloud-only tools (always de-identified first) ----------

export function prepareOutbound(comment: string, name: string, roster: string[]) {
  return redact(comment, name, roster);
}

export const LANGUAGES = ['Yoruba', 'Hausa', 'Igbo', 'Spanish', 'French', 'Portuguese', 'Arabic', 'Mandarin Chinese', 'Haitian Creole', 'Vietnamese'];

export async function translateTemplate(deidentified: string, language: string) {
  const t0 = performance.now();
  const prompt = [
    `Translate this school report comment for a parent into ${language}.`,
    `Keep the placeholder ${STUDENT_TOKEN} exactly as written (it will be replaced with the child's name later). Keep the meaning and warmth; use natural, respectful wording a parent would use.`,
    'Return only the translation.',
    `"""\n${deidentified}\n"""`,
  ].join('\n');
  const res = await getCloudText().generateContent(prompt);
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
  const res = await getCloudJson().generateContent(prompt);
  const obj = JSON.parse(res.response.text()) as { comment?: string; standards?: string[] };
  return { comment: String(obj.comment ?? ''), standards: obj.standards ?? [], prompt, ms: performance.now() - t0 };
}
