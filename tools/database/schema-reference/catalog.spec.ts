import { describe, expect, it } from 'vitest';
import { objectId, assertSupportedCatalogKinds } from './catalog';

describe('public catalog identity and completeness', () => {
  it('distinguishes overloaded routines and names with punctuation', () => {
    expect(objectId('function', 'library', 'lookup', 'text')).not.toBe(
      objectId('function', 'library', 'lookup', 'integer'),
    );
    expect(objectId('table', 'library', 'a.b')).not.toBe(objectId('table', 'library.a', 'b'));
  });
  it('rejects an unsupported schema object instead of omitting it', () => {
    expect(() =>
      assertSupportedCatalogKinds([{ catalog: 'pg_operator', name: 'custom_op' }]),
    ).toThrow('UNSUPPORTED_SCHEMA_OBJECT');
    expect(() =>
      assertSupportedCatalogKinds([{ catalog: 'pg_class', name: 'books' }]),
    ).not.toThrow();
  });
});
