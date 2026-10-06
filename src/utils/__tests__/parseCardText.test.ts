import { describe, it, expect } from 'vitest';
import { parseCardText } from '../badge/parseCardText';

// Every card here is synthetic.
const CARD = [
  'CORNER STORE DISTRIBUTORS',
  'Jordan Rivera',
  'Regional Sales Manager',
  '4100 Example Blvd, Suite 200',
  'Tampa, FL 33602',
  'O: (813) 555-0142',
  'M: 813.555.0199',
  'F: (813) 555-0100',
  'jordan.rivera@cornerstore.example',
  'www.cornerstore.example',
].join('\n');

describe('parseCardText', () => {
  it('reads the contact details a badge link never carries', () => {
    expect(parseCardText(CARD)).toEqual({
      email: 'jordan.rivera@cornerstore.example',
      phone: '813.555.0199',
      title: 'Regional Sales Manager',
      company: 'CORNER STORE DISTRIBUTORS',
      first_name: 'Jordan',
      last_name: 'Rivera',
      city: 'Tampa',
      state: 'FL',
      postal_code: '33602',
    });
  });

  it('prefers a mobile number, then a direct line, and never a fax', () => {
    expect(parseCardText('Fax 813-555-0100\nTel 813-555-0142').phone).toBe('813-555-0142');
    expect(parseCardText('Tel 813-555-0142\nCell: +1 (813) 555-0199').phone).toBe('+1 (813) 555-0199');
    expect(parseCardText('Fax: 813-555-0100').phone).toBeUndefined();
  });

  it('drops an extension rather than gluing it onto the number', () => {
    expect(parseCardText('Phone: 813-555-0142 ext. 204').phone).toBe('813-555-0142');
  });

  it('does not read a ZIP+4 or a street number as a phone', () => {
    const fields = parseCardText('4100 Example Blvd\nTampa, FL 33602-1234');
    expect(fields.phone).toBeUndefined();
    expect(fields.postal_code).toBe('33602-1234');
  });

  it('finds an email inside a labelled line and lowercases nothing', () => {
    expect(parseCardText('E: Jordan.Rivera@Example.com | example.com').email).toBe('Jordan.Rivera@Example.com');
  });

  it('uses the email to pick the person when two lines look like names', () => {
    const fields = parseCardText('Harbor Point\nJordan Rivera\njrivera@harborpoint.example');
    expect(fields.first_name).toBe('Jordan');
    expect(fields.last_name).toBe('Rivera');
  });

  it('title-cases an all-caps name but leaves the company as printed', () => {
    const fields = parseCardText('JORDAN RIVERA\nEXAMPLE LABS\nVP Marketing');
    expect(fields.first_name).toBe('Jordan');
    expect(fields.last_name).toBe('Rivera');
    expect(fields.company).toBe('EXAMPLE LABS');
  });

  it('does not take a company for a job title because it contains a title word', () => {
    const fields = parseCardText('Salesworks Inc\nJordan Rivera\nAccount Executive');
    expect(fields.company).toBe('Salesworks Inc');
    expect(fields.title).toBe('Account Executive');
  });

  it('returns nothing, without throwing, for empty or unreadable text', () => {
    expect(parseCardText('')).toEqual({});
    expect(parseCardText('~~ ## || 12')).toEqual({});
    expect(() => parseCardText(undefined as unknown as string)).not.toThrow();
  });
});
