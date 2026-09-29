import { describe, expect, it } from 'vitest';
import { resolveTemplate, templateReferences } from './template.js';

const fields = {
  'pr.title': 'Fix login',
  'pr.author': 'octocat',
  'pr.number': 7,
  'pr.draft': false,
};

describe('template resolution', () => {
  it('substitutes known fields, tolerating whitespace inside the braces', () => {
    expect(
      resolveTemplate('Thanks @{{pr.author}} for "{{ pr.title }}" (#{{pr.number}})', fields),
    ).toEqual({
      output: 'Thanks @octocat for "Fix login" (#7)',
      missing: [],
    });
  });

  it('renders a missing field as empty and reports it once', () => {
    expect(resolveTemplate('{{pr.reviewer}} and {{pr.reviewer}} on {{pr.title}}', fields)).toEqual({
      output: ' and  on Fix login',
      missing: ['pr.reviewer'],
    });
  });

  it('treats a null field as missing but renders false and zero', () => {
    expect(resolveTemplate('[{{a}}][{{b}}][{{c}}]', { a: null, b: false, c: 0 })).toEqual({
      output: '[][false][0]',
      missing: ['a'],
    });
  });

  it('does not resolve inherited object properties', () => {
    expect(resolveTemplate('{{constructor}}', fields)).toEqual({
      output: '',
      missing: ['constructor'],
    });
  });

  it('leaves text without tokens untouched and lists distinct references', () => {
    expect(resolveTemplate('No tokens {here}', fields).output).toBe('No tokens {here}');
    expect(templateReferences('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b']);
  });
});
