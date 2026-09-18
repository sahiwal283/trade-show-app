import { describe, it, expect } from 'vitest';
import { parseBadgePayload, PARSER_VERSION } from '../badge/parseBadgePayload';

// Shaped after the one confirmed decode: badge id, name, organization,
// city/state/ZIP, country, a second id, title, salutation, email, and a
// classification code.
const PIPE = '124649-907|Shamsher|Jessani|Virginia Trade Association|Glen Allen|VA|23059-8006|United States|50542|President|Mr.|sjessani@aol.com|DP';

describe('parseBadgePayload — delimited payloads', () => {
  it('pulls the contact out of a pipe-delimited badge', () => {
    const { fields } = parseBadgePayload(PIPE);
    expect(fields.badge_id).toBe('124649-907');
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.company).toBe('Virginia Trade Association');
    expect(fields.city).toBe('Glen Allen');
    expect(fields.state).toBe('VA');
    expect(fields.postal_code).toBe('23059-8006');
    expect(fields.country).toBe('United States');
    expect(fields.title).toBe('President');
    expect(fields.salutation).toBe('Mr.');
    expect(fields.email).toBe('sjessani@aol.com');
  });

  it('handles caret and tab delimiters the same way', () => {
    expect(parseBadgePayload(PIPE.replace(/\|/g, '^')).fields.email).toBe('sjessani@aol.com');
    expect(parseBadgePayload(PIPE.replace(/\|/g, '\t')).fields.email).toBe('sjessani@aol.com');
  });

  it('reads key=value payloads without positional guessing', () => {
    const { fields } = parseBadgePayload(
      'FIRST=Shamsher|LAST=Jessani|EMAIL=sjessani@aol.com|COMPANY=Virginia Trade Association|STATE=VA'
    );
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.company).toBe('Virginia Trade Association');
  });
});

describe('parseBadgePayload — ambiguous tokens', () => {
  it('reads 23059-8006 as a ZIP and 124649-907 as a badge id', () => {
    // Both match a digits-dash-digits shape. Only the ZIP has a 5-digit head.
    const { fields } = parseBadgePayload('124649-907|23059-8006');
    expect(fields.postal_code).toBe('23059-8006');
    expect(fields.badge_id).toBe('124649-907');
  });

  it('does not mistake a 9-digit badge id for a phone number', () => {
    const { fields } = parseBadgePayload(PIPE);
    expect(fields.phone).toBeUndefined();
  });

  it('keeps a second 5-digit number unmapped rather than overwriting the ZIP', () => {
    // The confirmed sample carries both a ZIP and a second numeric id.
    // Silently overwriting the real ZIP would be worse than leaving the
    // extra number unmapped and visible.
    const { fields, tokens } = parseBadgePayload('23059-8006|50542');
    expect(fields.postal_code).toBe('23059-8006');
    expect(tokens.find((t) => t.value === '50542')!.mappedTo).toBeNull();
  });

  it('treats VA as a state but DP as a classification code', () => {
    const { fields } = parseBadgePayload('Glen Allen|VA|DP');
    expect(fields.state).toBe('VA');
    expect(fields.attendee_type).toBe('DP');
  });

  it('recognizes a real 10-digit phone', () => {
    expect(parseBadgePayload('Jessani|804-555-0134').fields.phone).toBe('804-555-0134');
  });
});

describe('parseBadgePayload — never loses data', () => {
  it('keeps every token, including ones it cannot map', () => {
    const { tokens } = parseBadgePayload('Shamsher|ZZTOP9|Jessani');
    expect(tokens).toHaveLength(3);
    expect(tokens.find((t) => t.value === 'ZZTOP9')!.mappedTo).toBeNull();
  });

  it('does not throw on binary garbage, and reports no confidence', () => {
    const result = parseBadgePayload('\u0000\u0001\uFFFD');
    expect(result.confidence).toBe(0);
    expect(result.fields.email).toBeUndefined();
  });

  it('does not throw on an empty payload', () => {
    const result = parseBadgePayload('');
    expect(result.confidence).toBe(0);
    expect(result.tokens).toEqual([]);
  });

  it('handles an undelimited blob without crashing', () => {
    const result = parseBadgePayload('sjessani@aol.com');
    expect(result.fields.email).toBe('sjessani@aol.com');
  });

  it('stamps the parser version so scans can be re-parsed later', () => {
    expect(parseBadgePayload(PIPE).parserVersion).toBe(PARSER_VERSION);
  });
});

describe('parseBadgePayload — confidence', () => {
  it('scores a full record high enough to auto-accept', () => {
    expect(parseBadgePayload(PIPE).confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('scores a name-only record low enough to force review', () => {
    // A lead with no email and no company is not usable as-is; the rep must
    // see it flagged while the person is still standing there.
    const result = parseBadgePayload('Shamsher|Jessani');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('never exceeds 1', () => {
    expect(parseBadgePayload(PIPE).confidence).toBeLessThanOrEqual(1);
  });
});

// QR codes carry structured contact formats far more often than delimited
// strings. Each is detected by content, so the symbology is irrelevant.
const VCARD = [
  'BEGIN:VCARD', 'VERSION:3.0',
  'N:Jessani;Shamsher;;Mr.;', 'FN:Shamsher Jessani',
  'ORG:Virginia Trade Association', 'TITLE:President',
  'EMAIL;TYPE=INTERNET:sjessani@aol.com', 'TEL;TYPE=CELL:+1 804 555 0100',
  'ADR;TYPE=WORK:;;123 Main St;Glen Allen;VA;23059;United States',
  'END:VCARD',
].join('\r\n');

describe('parseBadgePayload — vCard', () => {
  it('maps the structured fields of a vCard', () => {
    const { fields, confidence } = parseBadgePayload(VCARD);
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.salutation).toBe('Mr.');
    expect(fields.company).toBe('Virginia Trade Association');
    expect(fields.title).toBe('President');
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.phone).toBe('+1 804 555 0100');
    expect(fields.city).toBe('Glen Allen');
    expect(fields.state).toBe('VA');
    expect(fields.postal_code).toBe('23059');
    expect(fields.country).toBe('United States');
    expect(confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('splits FN into first and last when N is absent', () => {
    const { fields } = parseBadgePayload('BEGIN:VCARD\nFN:Ana Maria Ruiz\nEMAIL:ana@x.com\nEND:VCARD');
    expect(fields.first_name).toBe('Ana Maria');
    expect(fields.last_name).toBe('Ruiz');
  });

  it('keeps every vCard line as a token so nothing is lost', () => {
    const { tokens } = parseBadgePayload(VCARD);
    expect(tokens.map((t) => t.value)).toContain('TITLE:President');
    expect(tokens.find((t) => t.value.startsWith('TITLE'))?.mappedTo).toBe('title');
  });
});

describe('parseBadgePayload — MeCard', () => {
  it('maps a MeCard, including its comma-ordered name and address', () => {
    const raw = 'MECARD:N:Jessani,Shamsher;ORG:Virginia Trade Association;TEL:8045550100;EMAIL:sjessani@aol.com;ADR:,,123 Main St,Glen Allen,VA,23059,USA;;';
    const { fields } = parseBadgePayload(raw);
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.company).toBe('Virginia Trade Association');
    expect(fields.phone).toBe('8045550100');
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.city).toBe('Glen Allen');
    expect(fields.state).toBe('VA');
    expect(fields.postal_code).toBe('23059');
  });
});

describe('parseBadgePayload — JSON', () => {
  it('maps a JSON object through the same key aliases as keyed text', () => {
    const raw = JSON.stringify({ firstName: 'Shamsher', lastName: 'Jessani', email: 'sjessani@aol.com', organization: 'Virginia Trade Association', jobTitle: 'President', zip: '23059' });
    const { fields } = parseBadgePayload(raw);
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.company).toBe('Virginia Trade Association');
    expect(fields.title).toBe('President');
    expect(fields.postal_code).toBe('23059');
  });

  it('does not choke on JSON that is not an object', () => {
    expect(() => parseBadgePayload('[1,2,3]')).not.toThrow();
    expect(() => parseBadgePayload('{"a":')).not.toThrow();
  });
});

describe('parseBadgePayload — URLs', () => {
  it('pulls recognizable contact keys out of a URL query string', () => {
    const raw = 'https://leads.example.com/capture?email=sjessani%40aol.com&first=Shamsher&last=Jessani&company=VTA';
    const { fields } = parseBadgePayload(raw);
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.company).toBe('VTA');
  });

  it('treats an opaque profile URL as zero fields, not as a name', () => {
    // Lead-retrieval vendors encode a profile URL in the badge QR. The
    // positional pass would otherwise read the host as a company.
    const raw = 'https://reg.example.com/attendee/8827364';
    const { fields, tokens, confidence } = parseBadgePayload(raw);
    expect(fields).toEqual({});
    expect(confidence).toBe(0);
    expect(tokens.map((t) => t.value)).toEqual([raw]);
  });
});

describe('parseBadgePayload — version', () => {
  it('reports v2 now that structured QR payloads are understood', () => {
    expect(PARSER_VERSION).toBe('v2');
  });
});
