import { describe, expect, it } from 'vitest';
import { pwaFiles, pwaHeadTags } from './plugin';

const attrs = (base: string) => pwaHeadTags(base).map((t) => ({ tag: t.tag, ...t.attrs }));

describe('加入主畫面 wiring in the page and the build', () => {
  it('links the manifest and the apple-touch-icon under the base', () => {
    expect(attrs('/homerun-derby/')).toEqual(
      expect.arrayContaining([
        { tag: 'link', rel: 'manifest', href: '/homerun-derby/manifest.webmanifest' },
        { tag: 'link', rel: 'apple-touch-icon', sizes: '180x180', href: '/homerun-derby/icons/apple-touch-icon.png' },
      ]),
    );
  });

  it('tells iOS to open it full screen with its name, drawing under the status bar', () => {
    expect(attrs('/homerun-derby/')).toEqual(
      expect.arrayContaining([
        { tag: 'meta', name: 'apple-mobile-web-app-capable', content: 'yes' },
        { tag: 'meta', name: 'mobile-web-app-capable', content: 'yes' },
        { tag: 'meta', name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { tag: 'meta', name: 'apple-mobile-web-app-title', content: '全壘打大賽' },
      ]),
    );
  });

  it('writes the manifest and every icon it or the page refers to', () => {
    const files = pwaFiles('/homerun-derby/');
    const manifest = JSON.parse(files.get('manifest.webmanifest') as string);
    const referenced = [
      ...manifest.icons.map((i: { src: string }) => i.src),
      ...pwaHeadTags('/homerun-derby/').map((t) => t.attrs?.href).filter((h): h is string => typeof h === 'string'),
    ].map((p: string) => p.replace('/homerun-derby/', ''));
    for (const path of referenced) expect(files.has(path), path).toBe(true);
    expect(files.get('icons/apple-touch-icon.png')).toBeInstanceOf(Uint8Array);
  });
});
