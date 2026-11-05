import type { PlanChange } from '@dialed/contracts';
import type { PlanProvider, ProviderMessage } from './providers/types';

export interface ExtractedClass {
  title: string;
  kind: 'lecture' | 'tutorial' | 'lab' | 'seminar' | 'other';
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  start: string;
  end: string;
  room?: string;
  confidence?: number;
}

export interface TimetableResult {
  classes: ExtractedClass[];
  termHint?: string;
  tokensIn: number;
  tokensOut: number;
}

const TIMETABLE_SYSTEM = `You are a timetable reader. You receive a university/school timetable (as text or image) and extract every class meeting into a JSON array.

Each entry has:
- title: the course name
- kind: one of lecture, tutorial, lab, seminar, other (map "Laboratory" to "lab", "Tut" to "tutorial", etc.)
- weekday: three-letter lowercase day (mon, tue, wed, thu, fri, sat, sun)
- start: "HH:MM" 24-hour time on a 5-minute grid
- end: "HH:MM" 24-hour time on a 5-minute grid
- room: the room code if visible (optional)
- confidence: 0.0–1.0, how sure you are about this entry (omit if >= 0.9)

Also look for a term/semester date hint (e.g. "Week of Sep 14" → term_hint "2026-09-14").

Return ONLY a JSON object: {"classes": [...], "term_hint": "YYYY-MM-DD" or null}
No explanation, no markdown fences.`;

const KIND_NORM: Record<string, ExtractedClass['kind']> = {
  lecture: 'lecture',
  lec: 'lecture',
  tutorial: 'tutorial',
  tut: 'tutorial',
  lab: 'lab',
  laboratory: 'lab',
  seminar: 'seminar',
  sem: 'seminar',
};

function normalizeKind(raw: string): ExtractedClass['kind'] {
  return KIND_NORM[raw.toLowerCase().trim()] ?? 'other';
}

const WEEKDAY_NORM: Record<string, ExtractedClass['weekday']> = {
  monday: 'mon',
  mon: 'mon',
  tuesday: 'tue',
  tue: 'tue',
  wednesday: 'wed',
  wed: 'wed',
  thursday: 'thu',
  thu: 'thu',
  friday: 'fri',
  fri: 'fri',
  saturday: 'sat',
  sat: 'sat',
  sunday: 'sun',
  sun: 'sun',
};

function normalizeWeekday(raw: string): ExtractedClass['weekday'] | null {
  return WEEKDAY_NORM[raw.toLowerCase().trim()] ?? null;
}

function normalizeTime(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    if (m[3].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  }
  const rounded = Math.round(min / 5) * 5;
  return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function parseClasses(raw: string): { classes: ExtractedClass[]; termHint?: string } {
  const text = raw
    .replace(/```json?\s*/g, '')
    .replace(/```/g, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else return { classes: [] };
  }

  const obj = parsed as { classes?: unknown[]; term_hint?: string };
  const classes: ExtractedClass[] = [];
  for (const raw of obj.classes ?? []) {
    const c = raw as Record<string, unknown>;
    const weekday = normalizeWeekday(String(c.weekday ?? ''));
    const start = normalizeTime(String(c.start ?? ''));
    const end = normalizeTime(String(c.end ?? ''));
    if (!weekday || !start || !end) continue;
    classes.push({
      title: String(c.title ?? '').trim(),
      kind: normalizeKind(String(c.kind ?? 'other')),
      weekday,
      start,
      end,
      room: c.room ? String(c.room).trim() : undefined,
      confidence: typeof c.confidence === 'number' ? c.confidence : undefined,
    });
  }
  return { classes, termHint: obj.term_hint ?? undefined };
}

export async function extractTextFromDocx(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

export async function extractTextFromPdf(
  buf: Buffer,
): Promise<{ text: string; pageImages: Buffer[] }> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument(params: { data: Uint8Array }): {
      promise: Promise<{
        numPages: number;
        getPage(n: number): Promise<{
          getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => typeof item.str === 'string')
      .map((item) => item.str!)
      .join(' ');
    text += pageText + '\n';
  }

  if (text.replace(/\s/g, '').length < 200) {
    return { text: '', pageImages: [buf] };
  }

  return { text: text.trim(), pageImages: [] };
}

export type FileKind = 'image' | 'pdf' | 'docx';

export function detectFileKind(buf: Buffer): FileKind | null {
  if (buf.length < 4) return null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image';
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image';
  // HEIC (ftyp box)
  if (buf.length >= 12 && buf.subarray(4, 8).toString() === 'ftyp') return 'image';
  // PDF
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  // DOCX (ZIP with PK signature)
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  return null;
}

const MAX_DOCX_SIZE = 50 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 500;

export function validateDocxSafety(buf: Buffer): void {
  if (buf.length > MAX_DOCX_SIZE) {
    throw Object.assign(new Error('docx_too_large'), { code: 'bad_file' });
  }
  let count = 0;
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf[0 + offset] === 0x50 && buf[1 + offset] === 0x4b) {
      if (
        (buf[2 + offset] === 0x03 && buf[3 + offset] === 0x04) ||
        (buf[2 + offset] === 0x01 && buf[3 + offset] === 0x02)
      ) {
        count++;
        if (count > MAX_DOCX_ENTRIES) {
          throw Object.assign(new Error('docx_zip_bomb'), { code: 'bad_file' });
        }
      }
    }
    offset++;
  }
}

export interface ExtractOpts {
  provider: PlanProvider;
  fileBuf: Buffer;
  fileName: string;
  signal?: AbortSignal;
}

export async function extractTimetable(opts: ExtractOpts): Promise<TimetableResult> {
  const { provider, fileBuf, fileName, signal } = opts;
  const kind = detectFileKind(fileBuf);
  if (!kind) throw Object.assign(new Error('unsupported_file'), { code: 'bad_file' });

  let textContent = '';
  let imageBuffers: Buffer[] = [];

  switch (kind) {
    case 'docx': {
      validateDocxSafety(fileBuf);
      textContent = await extractTextFromDocx(fileBuf);
      break;
    }
    case 'pdf': {
      const result = await extractTextFromPdf(fileBuf);
      textContent = result.text;
      imageBuffers = result.pageImages;
      break;
    }
    case 'image': {
      imageBuffers = [fileBuf];
      break;
    }
  }

  const messages: ProviderMessage[] = [];

  if (textContent) {
    messages.push({
      role: 'user',
      content: `Here is the text content of a timetable file "${fileName}":\n\n${textContent}\n\nExtract all class meetings as JSON.`,
    });
  } else if (imageBuffers.length > 0 && provider.supportsVision) {
    const base64 = imageBuffers[0]!.toString('base64');
    const mediaType = kind === 'pdf' ? 'application/pdf' : detectImageMediaType(fileBuf);
    messages.push({
      role: 'user',
      content: JSON.stringify([
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `This is a timetable image "${fileName}". Extract all class meetings as JSON.`,
        },
      ]),
    });
  } else if (imageBuffers.length > 0) {
    throw Object.assign(new Error('vision_unavailable'), { code: 'vision_unavailable' });
  } else {
    return { classes: [], tokensIn: 0, tokensOut: 0 };
  }

  const response = await provider.run({
    system: TIMETABLE_SYSTEM,
    messages,
    tools: [],
    maxTokens: 4096,
    signal,
  });

  const { classes, termHint } = parseClasses(response.content);
  return {
    classes,
    termHint,
    tokensIn: response.tokens_in,
    tokensOut: response.tokens_out,
  };
}

function detectImageMediaType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length >= 12 && buf.subarray(4, 8).toString() === 'ftyp') return 'image/heic';
  return 'image/jpeg';
}

export function classesToPlanChanges(
  classes: ExtractedClass[],
  categoryId: string,
  termStart: string,
  termEnd: string,
): PlanChange[] {
  return classes.map((c): PlanChange => ({
    kind: 'new',
    title: c.title + (c.kind !== 'lecture' ? ` (${c.kind})` : '') + (c.room ? ` — ${c.room}` : ''),
    category_id: categoryId,
    repeat: {
      weekday: c.weekday,
      from: termStart,
      until: termEnd,
    },
    start: c.start,
    end: c.end,
    note: `${c.kind}${c.room ? ` in ${c.room}` : ''}`,
  }));
}

export function termNameFromDate(dateStr: string): string {
  const month = new Date(dateStr + 'T12:00:00Z').getMonth();
  if (month >= 8 && month <= 11) return 'Fall term';
  if (month >= 0 && month <= 3) return 'Winter term';
  return 'Summer term';
}
