/**
 * 加入主畫面: the web app manifest and the icon files, all generated at build
 * time (see plugin.ts). Paths are absolute under the site base (/homerun-derby/).
 */

export const APP_NAME = '全壘打大賽';
/** The page background (style.css), so the splash screen and status bar match it. */
export const THEME_COLOR = '#0e1330';

/** Icon files the build writes, by path under the base. */
export const ICON_FILES = {
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
  /** iOS ignores manifest icons for the home screen and uses this one. */
  'icons/apple-touch-icon.png': 180,
} as const;

export const MANIFEST_FILE = 'manifest.webmanifest';

export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: 'fullscreen' | 'standalone';
  orientation: 'portrait';
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: 'image/png'; purpose: 'any' | 'maskable' }[];
}

export function webManifest(base: string): WebManifest {
  const icon = (file: string, size: number, purpose: 'any' | 'maskable') => ({ src: base + file, sizes: `${size}x${size}`, type: 'image/png' as const, purpose });
  return {
    id: base,
    name: APP_NAME,
    short_name: APP_NAME,
    lang: 'zh-Hant',
    start_url: base,
    scope: base,
    // Chrome on Android hides the status bar too; iOS treats it as standalone.
    display: 'fullscreen',
    orientation: 'portrait',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: [
      icon('icons/icon-192.png', 192, 'any'),
      icon('icons/icon-512.png', 512, 'any'),
      // The icon is drawn full-bleed with the ball inside the maskable safe zone, so one file serves both.
      icon('icons/icon-512.png', 512, 'maskable'),
    ],
  };
}
