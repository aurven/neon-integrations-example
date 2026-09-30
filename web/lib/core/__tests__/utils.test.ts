import { describe, it, expect } from 'vitest';
import {
  removeNonAlphanumeric,
  removeNonAlphanumericPreserveDot,
  removeATags,
  stripAllCData,
  hasFileExtension,
  getImageNameFromUrl,
  textToHtmlParagraphs,
  generateAutoId,
  bodyGenerator,
  metadataGenerator,
  parseSrcset,
  safeLogRequest,
  normalizePrincipals,
} from '../utils';

describe('removeNonAlphanumeric', () => {
  it('strips non alphanumeric characters except underscore/hyphen', () => {
    expect(removeNonAlphanumeric('Hello, World! 123')).toBe('HelloWorld123');
    expect(removeNonAlphanumeric('foo_bar-baz.qux')).toBe('foo_bar-bazqux');
  });

  it('passes through non-string values unchanged', () => {
    expect(removeNonAlphanumeric(null)).toBe(null);
    expect(removeNonAlphanumeric(undefined)).toBe(undefined);
  });
});

describe('removeNonAlphanumericPreserveDot', () => {
  it('preserves dots while stripping other characters', () => {
    expect(removeNonAlphanumericPreserveDot('my file (1).jpg')).toBe('myfile1.jpg');
  });
});

describe('removeATags', () => {
  it('removes opening and closing anchor tags', () => {
    expect(removeATags('<a href="x">link</a> text')).toBe('link text');
  });
});

describe('stripAllCData', () => {
  it('removes CDATA wrappers while preserving content', () => {
    expect(stripAllCData('<x><![CDATA[hello]]></x>')).toBe('<x>hello</x>');
  });

  it('handles multiple and multiline CDATA sections', () => {
    const input = '<a><![CDATA[one\ntwo]]></a><b><![CDATA[three]]></b>';
    expect(stripAllCData(input)).toBe('<a>one\ntwo</a><b>three</b>');
  });
});

describe('hasFileExtension', () => {
  it('returns true for filenames with an extension', () => {
    expect(hasFileExtension('image.jpg')).toBe(true);
    expect(hasFileExtension('archive.tar.gz')).toBe(true);
  });

  it('returns false for filenames without an extension', () => {
    expect(hasFileExtension('README')).toBe(false);
  });
});

describe('getImageNameFromUrl', () => {
  it('extracts and sanitizes the filename from a URL', () => {
    // The space in the path gets URL-encoded to %20 by the URL constructor,
    // and removeNonAlphanumericPreserveDot strips the resulting digits/percent.
    expect(getImageNameFromUrl('https://example.com/path/my image!.jpg')).toBe('my20image.jpg');
  });

  it('strips non-alphanumeric characters that do not need encoding', () => {
    expect(getImageNameFromUrl('https://example.com/path/my!image.jpg')).toBe('myimage.jpg');
  });

  it('returns null for an invalid URL', () => {
    expect(getImageNameFromUrl('not a url')).toBe(null);
  });
});

describe('textToHtmlParagraphs', () => {
  it('wraps each paragraph in <p> tags', () => {
    expect(textToHtmlParagraphs('Hello\n\nWorld')).toBe('<p>Hello</p><p>World</p>');
  });

  it('trims surrounding whitespace', () => {
    expect(textToHtmlParagraphs('  Hello  ')).toBe('<p>Hello</p>');
  });
});

describe('generateAutoId', () => {
  it('generates an ID with the expected shape', () => {
    const id = generateAutoId();
    expect(id).toMatch(/^U[a-zA-Z0-9]{13}$/);
  });

  it('generates distinct IDs across calls', () => {
    const a = generateAutoId();
    const b = generateAutoId();
    expect(a).not.toBe(b);
  });
});

describe('bodyGenerator', () => {
  it('produces a flattened XML doc containing supplied content', () => {
    const xml = bodyGenerator({ headline: 'My Headline', summary: 'My Summary' });
    expect(xml).toContain('<p>My Headline</p>');
    expect(xml).toContain('<p>My Summary</p>');
    expect(xml).toContain('<doc xml:lang="en-us">');
    // newlines and 4-space indentation should be stripped
    expect(xml).not.toContain('\n');
    expect(xml).not.toContain('    ');
  });

  it('falls back to dummy text when no options are provided', () => {
    const xml = bodyGenerator();
    expect(xml).toContain('<?EM-dummyText Headline ?>');
    expect(xml).toContain('<?EM-dummyText Caption ?>');
  });

  it('includes fileref attribute when mainImageReference is provided', () => {
    const xml = bodyGenerator({ mainImageReference: 'abc123' });
    expect(xml).toContain('fileref="abc123"');
  });
});

describe('metadataGenerator', () => {
  it('embeds SEO fields into the metadata XML', () => {
    const xml = metadataGenerator({ seoTitle: 'Title', seoMeta: 'Description', keywords: 'a,b' });
    expect(xml).toContain('<SEOTitle>Title</SEOTitle>');
    expect(xml).toContain('<MetaDescription>Description</MetaDescription>');
    expect(xml).toContain('<Keywords>a,b</Keywords>');
  });

  it('defaults SEO fields to empty strings when meta is missing', () => {
    const xml = metadataGenerator(undefined);
    expect(xml).toContain('<SEOTitle></SEOTitle>');
  });

  it('includes print fields when provided', () => {
    const xml = metadataGenerator({
      printSection: '/Product/World',
      printPriority: '2',
      printIssueDate: '20260620',
      printDiffusion: 'PRINT',
    });
    expect(xml).toContain('<PrintSection>/Product/World</PrintSection>');
    expect(xml).toContain('<PrintPriority>2</PrintPriority>');
    expect(xml).toContain('<PrintIssueDate>20260620</PrintIssueDate>');
    expect(xml).toContain('<Diff_Print>PRINT</Diff_Print>');
  });

  it('renders empty print fields when not provided', () => {
    const xml = metadataGenerator(null);
    expect(xml).toContain('<PrintSection></PrintSection>');
    expect(xml).toContain('<Diff_Print></Diff_Print>');
  });
});

describe('parseSrcset', () => {
  it('parses width descriptors', () => {
    expect(parseSrcset('a.jpg 320w, b.jpg 640w')).toEqual([
      { url: 'a.jpg', width: 320 },
      { url: 'b.jpg', width: 640 },
    ]);
  });

  it('parses density descriptors scaled to approx width', () => {
    expect(parseSrcset('a.jpg 2x')).toEqual([{ url: 'a.jpg', width: 2000 }]);
  });

  it('falls back to width 0 when no descriptor is present', () => {
    expect(parseSrcset('a.jpg')).toEqual([{ url: 'a.jpg', width: 0 }]);
  });
});

describe('safeLogRequest', () => {
  it('redacts sensitive headers and body fields', () => {
    const result = safeLogRequest(
      { Authorization: 'Bearer xyz', 'Content-Type': 'application/json' },
      { apikey: 'secret', name: 'ok' }
    );
    expect(result.headers['Authorization']).toBe('[REDACTED]');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect((result.body as Record<string, unknown>).apikey).toBe('[REDACTED]');
    expect((result.body as Record<string, unknown>).name).toBe('ok');
  });

  it('returns data unredacted when DISABLE_SAFE_LOGGING is true', () => {
    const original = process.env.DISABLE_SAFE_LOGGING;
    process.env.DISABLE_SAFE_LOGGING = 'true';
    try {
      const result = safeLogRequest({ apikey: 'secret' }, { token: 'abc' });
      expect(result.headers['apikey']).toBe('secret');
      expect((result.body as Record<string, unknown>).token).toBe('abc');
    } finally {
      if (original === undefined) delete process.env.DISABLE_SAFE_LOGGING;
      else process.env.DISABLE_SAFE_LOGGING = original;
    }
  });
});

describe('normalizePrincipals', () => {
  it('returns an empty array for falsy input', () => {
    expect(normalizePrincipals(undefined)).toEqual([]);
    expect(normalizePrincipals(null)).toEqual([]);
    expect(normalizePrincipals('')).toEqual([]);
  });

  it('wraps a single value in an array', () => {
    expect(normalizePrincipals('abc-123')).toEqual(['abc-123']);
  });

  it('filters out falsy entries from an array', () => {
    expect(normalizePrincipals(['a', null, 'b', undefined, ''])).toEqual(['a', 'b']);
  });
});
