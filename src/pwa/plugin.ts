import type { HtmlTagDescriptor, Plugin } from 'vite';
import { iconPng } from './icon';
import { APP_NAME, ICON_FILES, MANIFEST_FILE, webManifest } from './manifest';

/**
 * Vite plugin for 加入主畫面: serves (dev) or writes (build) the manifest and
 * the generated icons, and adds the tags that point at them to index.html.
 * No service worker: the game needs no offline mode, and a stale cache after a
 * deploy would be worse than none.
 */

/** Tags for <head>, with paths under `base`. */
export function pwaHeadTags(base: string): HtmlTagDescriptor[] {
  const meta = (name: string, content: string): HtmlTagDescriptor => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
  return [
    { tag: 'link', attrs: { rel: 'manifest', href: base + MANIFEST_FILE }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}icons/apple-touch-icon.png` }, injectTo: 'head' },
    // iOS opens a home screen page full screen with these; the page already pads for the notch (safe-area insets).
    meta('apple-mobile-web-app-capable', 'yes'),
    meta('mobile-web-app-capable', 'yes'),
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent'),
    meta('apple-mobile-web-app-title', APP_NAME),
  ];
}

/** Every file to publish, by path under `base`. */
export function pwaFiles(base: string): Map<string, string | Uint8Array> {
  const files = new Map<string, string | Uint8Array>([[MANIFEST_FILE, JSON.stringify(webManifest(base), null, 2)]]);
  for (const [path, size] of Object.entries(ICON_FILES)) files.set(path, iconPng(size));
  return files;
}

const CONTENT_TYPE: Record<string, string> = { '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export function pwa(): Plugin {
  let base = '/';
  let files: Map<string, string | Uint8Array> | null = null;
  const all = () => (files ??= pwaFiles(base));
  return {
    name: 'homerun-derby:pwa',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const file = path.startsWith(base) ? all().get(path.slice(base.length)) : undefined;
        if (file === undefined) return next();
        res.setHeader('Content-Type', CONTENT_TYPE[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream');
        res.end(file);
      });
    },
    generateBundle() {
      for (const [fileName, source] of all()) this.emitFile({ type: 'asset', fileName, source });
    },
    transformIndexHtml() {
      return pwaHeadTags(base);
    },
  };
}
