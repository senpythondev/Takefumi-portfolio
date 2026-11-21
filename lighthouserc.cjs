/**
 * Lighthouse CI configuration: the budgets live in lighthouserc.json; this file adds the CPU
 * slowdown calibrated to the machine (scripts/lhci-calibrate.ts, run first by `npm run lhci`).
 * Without a calibration the Lighthouse default (4×) applies.
 *
 * Two collection passes (`npm run lhci`):
 *   1. default: every URL with simulated throttling. Every assertion except the TBT of the
 *      static, case-study and evidence pages.
 *   2. LHCI_PASS=applied: those three pages again with applied (devtools) throttling, marked
 *      `lhci=applied` in the URL so the assertions can tell the passes apart. Only their TBT is
 *      asserted (200 ms, median of the runs).
 *   PM decision, final round 2026-11-21: simulated TBT counts the first layout of these pages as
 *   blocking and swung 100–290 ms between runs of the same code, at the 200 ms limit.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- LHCI loads this file as CommonJS
const { existsSync, readFileSync } = require('node:fs');
const config = JSON.parse(readFileSync(`${__dirname}/lighthouserc.json`, 'utf8'));
const calibration = `${__dirname}/.lighthouseci/cpu.json`;
const throttling = {};
if (existsSync(calibration)) {
  const { multiplier, benchmarkIndex } = JSON.parse(readFileSync(calibration, 'utf8'));
  throttling.cpuSlowdownMultiplier = multiplier;
  console.warn(`Lighthouse CPU slowdown ${multiplier}× (benchmarkIndex ${benchmarkIndex})`);
}
config.ci.collect.settings.throttling = throttling;

if (process.env.LHCI_PASS === 'applied') {
  const TBT_PAGES = /\/(evidence|work)\/|\?quality=static/;
  config.ci.collect.url = config.ci.collect.url
    .filter((url) => TBT_PAGES.test(url))
    .map((url) => `${url}${url.includes('?') ? '&' : '?'}lhci=applied`);
  config.ci.collect.settings.throttlingMethod = 'devtools';
  console.warn(`Lighthouse applied (devtools) throttling for TBT: ${config.ci.collect.url.join(', ')}`);
}
module.exports = config;
