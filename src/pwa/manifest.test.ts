import { describe, expect, it } from 'vitest';
import { webManifest } from './manifest';

describe('web app manifest: 加入主畫面 opens the game like an app', () => {
  const m = webManifest('/homerun-derby/');

  it('is named 全壘打大賽', () => {
    expect(m.name).toBe('全壘打大賽');
    expect(m.short_name).toBe('全壘打大賽');
    expect(m.lang).toBe('zh-Hant');
  });

  it('opens full screen, in portrait, at the game under the site base', () => {
    expect(m.display).toBe('fullscreen');
    expect(m.orientation).toBe('portrait');
    expect(m.start_url).toBe('/homerun-derby/');
    expect(m.scope).toBe('/homerun-derby/');
    expect(m.id).toBe('/homerun-derby/');
  });

  it('uses the page colours for the splash screen and the status bar', () => {
    expect(m.theme_color).toBe('#0e1330');
    expect(m.background_color).toBe('#0e1330');
  });

  it('lists PNG icons at 192 and 512 px, and a maskable one for Android', () => {
    expect(m.icons).toEqual([
      { src: '/homerun-derby/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/homerun-derby/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/homerun-derby/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});
