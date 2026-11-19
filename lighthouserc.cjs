/**
 * Lighthouse CI configuration: the budgets live in lighthouserc.json; this file adds the CPU
 * slowdown calibrated to the machine (scripts/lhci-calibrate.ts, run first by `npm run lhci`).
 * Without a calibration the Lighthouse default (4×) applies.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- LHCI loads this file as CommonJS
const { existsSync, readFileSync } = require('node:fs');
const config = JSON.parse(readFileSync(`${__dirname}/lighthouserc.json`, 'utf8'));
const calibration = `${__dirname}/.lighthouseci/cpu.json`;
if (existsSync(calibration)) {
  const { multiplier, benchmarkIndex } = JSON.parse(readFileSync(calibration, 'utf8'));
  config.ci.collect.settings.throttling = { cpuSlowdownMultiplier: multiplier };
  console.warn(`Lighthouse CPU slowdown ${multiplier}× (benchmarkIndex ${benchmarkIndex})`);
}
module.exports = config;
