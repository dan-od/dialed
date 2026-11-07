import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classesToPlanChanges,
  detectFileKind,
  extractTextFromDocx,
  extractTextFromPdf,
  extractTimetable,
  termNameFromDate,
  newTermDates,
  validateDocxSafety,
  type ExtractedClass,
} from '../src/timetable';
import type { PlanProvider, ProviderRunOpts, ProviderStepResult } from '../src/providers/types';

const FIXTURES = join(
  import.meta.dirname ?? __dirname,
  '..',
  '..',
  '..',
  'backend',
  'seed',
  'fixtures',
  'timetable',
);
const EXPECTED = JSON.parse(readFileSync(join(FIXTURES, 'expected-classes.json'), 'utf8')) as {
  expected_classes: ExtractedClass[];
  term_hint: string;
};
const FIXTURE_RESPONSE = JSON.parse(readFileSync(join(FIXTURES, 'fixture-response.json'), 'utf8'));

function createMockProvider(response: string): PlanProvider {
  return {
    id: 'mock',
    displayName: 'Mock',
    supportsVision: true,
    async run(_opts: ProviderRunOpts): Promise<ProviderStepResult> {
      return { content: response, tool_calls: [], tokens_in: 100, tokens_out: 50 };
    },
  };
}

describe('detectFileKind', () => {
  it('identifies PNG', () => {
    const png = readFileSync(join(FIXTURES, 'timetable-ref002.png'));
    expect(detectFileKind(png)).toBe('image');
  });

  it('identifies PDF', () => {
    const pdf = readFileSync(join(FIXTURES, 'timetable.pdf'));
    expect(detectFileKind(pdf)).toBe('pdf');
  });

  it('identifies DOCX', () => {
    const docx = readFileSync(join(FIXTURES, 'timetable.docx'));
    expect(detectFileKind(docx)).toBe('docx');
  });

  it('rejects unknown files', () => {
    expect(detectFileKind(Buffer.from('hello'))).toBeNull();
  });
});

describe('extractTextFromPdf', () => {
  it('extracts text from text PDF', async () => {
    const pdf = readFileSync(join(FIXTURES, 'timetable.pdf'));
    const result = await extractTextFromPdf(pdf);
    expect(result.text.length).toBeGreaterThan(200);
    expect(result.pageImages).toHaveLength(0);
  });

  it('treats scanned PDF as image', async () => {
    const pdf = readFileSync(join(FIXTURES, 'timetable-scanned.pdf'));
    const result = await extractTextFromPdf(pdf);
    expect(result.pageImages.length).toBeGreaterThan(0);
  });
});

describe('extractTextFromDocx', () => {
  it('extracts text from DOCX', async () => {
    const docx = readFileSync(join(FIXTURES, 'timetable.docx'));
    const text = await extractTextFromDocx(docx);
    expect(text.length).toBeGreaterThan(50);
  });
});

describe('validateDocxSafety', () => {
  it('accepts normal DOCX', () => {
    const docx = readFileSync(join(FIXTURES, 'timetable.docx'));
    expect(() => validateDocxSafety(docx)).not.toThrow();
  });
});

describe('extractTimetable', () => {
  it('extracts 6 classes from REF-002 PNG via vision', async () => {
    const png = readFileSync(join(FIXTURES, 'timetable-ref002.png'));
    const provider = createMockProvider(JSON.stringify(FIXTURE_RESPONSE));
    const result = await extractTimetable({
      provider,
      fileBuf: png,
      fileName: 'timetable-ref002.png',
    });
    expect(result.classes).toHaveLength(6);
    expect(result.termHint).toBe('2026-09-14');

    for (const expected of EXPECTED.expected_classes) {
      const found = result.classes.find(
        (c) =>
          c.title.toLowerCase().includes(expected.title.toLowerCase().slice(0, 20)) &&
          c.weekday === expected.weekday &&
          c.start === expected.start &&
          c.end === expected.end,
      );
      expect(
        found,
        `Expected class: ${expected.title} ${expected.weekday} ${expected.start}`,
      ).toBeTruthy();
    }
  });

  it('extracts from text PDF via text', async () => {
    const pdf = readFileSync(join(FIXTURES, 'timetable.pdf'));
    const provider = createMockProvider(JSON.stringify(FIXTURE_RESPONSE));
    const result = await extractTimetable({
      provider,
      fileBuf: pdf,
      fileName: 'timetable.pdf',
    });
    expect(result.classes).toHaveLength(6);
  });

  it('extracts from DOCX via text', async () => {
    const docx = readFileSync(join(FIXTURES, 'timetable.docx'));
    const provider = createMockProvider(JSON.stringify(FIXTURE_RESPONSE));
    const result = await extractTimetable({
      provider,
      fileBuf: docx,
      fileName: 'timetable.docx',
    });
    expect(result.classes).toHaveLength(6);
  });

  it('throws on unsupported file', async () => {
    const provider = createMockProvider('{}');
    await expect(
      extractTimetable({
        provider,
        fileBuf: Buffer.from('not a real file'),
        fileName: 'test.exe',
      }),
    ).rejects.toThrow('unsupported_file');
  });

  it('throws vision_unavailable for image with non-vision provider', async () => {
    const png = readFileSync(join(FIXTURES, 'timetable-ref002.png'));
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run() {
        return { content: '', tool_calls: [], tokens_in: 0, tokens_out: 0 };
      },
    };
    await expect(
      extractTimetable({ provider, fileBuf: png, fileName: 'test.png' }),
    ).rejects.toThrow('vision_unavailable');
  });
});

describe('classesToPlanChanges', () => {
  it('creates 6 plan changes from expected classes', () => {
    const changes = classesToPlanChanges(
      EXPECTED.expected_classes as ExtractedClass[],
      'cat-class-id',
      '2026-09-14',
      '2026-12-11',
    );
    expect(changes).toHaveLength(6);
    expect(changes[0]!.kind).toBe('new');
    for (const c of changes) {
      expect(c.kind).toBe('new');
      const nc = c as { repeat?: { from: string; until: string } };
      expect(nc.repeat?.from).toBe('2026-09-14');
      expect(nc.repeat?.until).toBe('2026-12-11');
    }
  });
});

describe('termNameFromDate', () => {
  it('September → Fall term', () => expect(termNameFromDate('2026-09-14')).toBe('Fall term'));
  it('January → Winter term', () => expect(termNameFromDate('2027-01-15')).toBe('Winter term'));
  it('June → Summer term', () => expect(termNameFromDate('2026-06-01')).toBe('Summer term'));
});

describe('newTermDates', () => {
  it('uses the file hint when its term is still running', () =>
    expect(newTermDates('2026-09-14', '2026-11-07')).toEqual({
      starts: '2026-09-14',
      ends: '2026-12-14',
    }));
  it('ignores a hint whose term is already over', () =>
    expect(newTermDates('2026-09-14', '2037-10-20')).toEqual({
      starts: '2037-10-20',
      ends: '2038-01-20',
    }));
  it('no or malformed hint → today', () => {
    expect(newTermDates(undefined, '2037-10-20').starts).toBe('2037-10-20');
    expect(newTermDates('Sep 14', '2037-10-20').starts).toBe('2037-10-20');
  });
});
