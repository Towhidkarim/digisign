import type { PDFFont } from 'pdf-lib';

/**
 * Built-in PDF fonts cannot draw every character, and pdf-lib throws when asked to. A signed
 * PDF must always be buildable, so anything the font cannot draw becomes "?" and the line is
 * flattened to one line of single spaces.
 */
export function safeText(font: PDFFont, value: string): string {
  let out = '';
  for (const char of value.replace(/\s+/g, ' ')) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += '?';
    }
  }
  return out;
}
