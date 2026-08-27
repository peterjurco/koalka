import { describe, it, expect } from 'vitest';
import { htmlToText, looksLikePdf } from './fetchDocument.ts';

describe('htmlToText', () => {
  it('extracts visible text', () => {
    const text = htmlToText('<html><body><h1>Preferencie</h1><p>PS 20,8 %</p></body></html>');
    expect(text).toContain('Preferencie');
    expect(text).toContain('PS 20,8 %');
  });

  it('drops script and style content', () => {
    const text = htmlToText(
      '<body><script>var x = "SMER 99 %";</script><style>.a{color:red}</style><p>SMER 17,3 %</p></body>',
    );
    expect(text).not.toContain('99');
    expect(text).not.toContain('color:red');
    expect(text).toContain('SMER 17,3 %');
  });

  it('collapses runs of whitespace but keeps line structure', () => {
    const text = htmlToText('<body><p>PS   20,8</p>\n\n\n<p>SMER   17,3</p></body>');
    expect(text).toMatch(/PS 20,8/);
    expect(text).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('looksLikePdf', () => {
  it('detects a pdf by content type', () => {
    expect(looksLikePdf('https://ako.sk/x', 'application/pdf')).toBe(true);
  });

  it('detects a pdf by path even with a query string', () => {
    expect(looksLikePdf('https://ako.sk/x/pref.pdf?v=2', 'application/octet-stream')).toBe(true);
  });

  it('treats html as html', () => {
    expect(looksLikePdf('https://ako.sk/report/', 'text/html; charset=utf-8')).toBe(false);
  });
});
