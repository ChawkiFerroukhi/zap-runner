export type JsonTone = 'key' | 'string' | 'literal' | 'punctuation' | 'plain';

export interface JsonSegment {
  text: string;
  tone: JsonTone;
}

const TOKENS =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)|([{}[\],])|(\s+|.)/g;

export function highlightJson(json: string): JsonSegment[][] {
  return json.split('\n').map((line) => {
    const segments: JsonSegment[] = [];
    for (const match of line.matchAll(TOKENS)) {
      const [, quoted, colon, literal, punctuation, other] = match;
      if (quoted !== undefined) {
        if (colon !== undefined) {
          segments.push({ text: quoted, tone: 'key' }, { text: colon, tone: 'punctuation' });
        } else {
          segments.push({ text: quoted, tone: 'string' });
        }
      } else if (literal !== undefined) {
        segments.push({ text: literal, tone: 'literal' });
      } else if (punctuation !== undefined) {
        segments.push({ text: punctuation, tone: 'punctuation' });
      } else if (other !== undefined) {
        segments.push({ text: other, tone: 'plain' });
      }
    }
    return segments;
  });
}
