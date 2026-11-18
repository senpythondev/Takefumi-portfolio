import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';

export type ScriptSize = { url: string; raw: number; gzip: number; startTime: number };

/**
 * Every script the page requested, with its gzip size (zlib default level, measured on the body,
 * independent of server compression) and its request start time relative to navigation.
 * `stageStart` is the time of performance.mark('stage:start') set by StageLoader, or null.
 */
export async function collectScripts(page: Page): Promise<{ scripts: ScriptSize[]; stageStart: number | null }> {
  const { entries, stageStart } = await page.evaluate(() => ({
    entries: performance
      .getEntriesByType('resource')
      .filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script' || e.name.endsWith('.js'))
      .map((e) => ({ url: e.name, startTime: e.startTime })),
    stageStart: performance.getEntriesByName('stage:start')[0]?.startTime ?? null,
  }));
  const scripts: ScriptSize[] = [];
  for (const e of entries) {
    const body = await (await page.request.get(e.url)).body();
    scripts.push({ url: new URL(e.url).pathname, raw: body.length, gzip: gzipSync(body).length, startTime: e.startTime });
  }
  return { scripts: scripts.sort((a, b) => b.gzip - a.gzip), stageStart };
}

export const sum = (xs: ScriptSize[]) => xs.reduce((n, s) => n + s.gzip, 0);
export const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;
