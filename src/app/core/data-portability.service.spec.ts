import { describe, expect, it } from 'vitest';
import {
  inspectNetscapeHtml,
  normalizeBookmarkUrl,
  wrapNetscapeProfile,
} from './data-portability.service';

describe('bookmark portability', () => {
  it('normalises URLs and removes fragments and default ports', () => {
    expect(normalizeBookmarkUrl('Example.COM:443/docs#part')).toBe('https://example.com/docs');
    expect(() => normalizeBookmarkUrl('javascript:alert(1)')).toThrow();
  });

  it('recognises the browser toolbar and nested folders', () => {
    const body = [
      '    <DT><H3>Engineering</H3>',
      '    <DL><p>',
      '        <DT><H3>Angular</H3>',
      '        <DL><p>',
      '            <DT><A HREF="https://angular.dev/">Angular</A>',
      '        </DL><p>',
      '    </DL><p>',
    ].join('\n');
    const html = wrapNetscapeProfile('Bookmarks bar', body, true);
    expect(inspectNetscapeHtml(html)).toEqual({
      bookmarks: 1,
      folders: 3,
      toolbarFolder: 'Bookmarks bar',
      duplicates: 0,
    });
  });

  it('counts duplicates only from the selected profile URL set', () => {
    const html = wrapNetscapeProfile(
      'Office',
      '<DT><A HREF="https://example.com/">Example</A>',
      false,
    );
    expect(inspectNetscapeHtml(html, new Set(['https://example.com/'])).duplicates).toBe(1);
    expect(inspectNetscapeHtml(html, new Set(['https://other.example/'])).duplicates).toBe(0);
  });

  it('round-trips compatible Netscape HTML metadata', () => {
    const html = wrapNetscapeProfile(
      'Office & Learning',
      '<DT><A HREF="https://angular.dev/" ADD_DATE="1700000000">Angular</A>',
      false,
    );
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('Office &amp; Learning');
    expect(inspectNetscapeHtml(html).bookmarks).toBe(1);
    expect(inspectNetscapeHtml(html).toolbarFolder).toBeNull();
  });
});
