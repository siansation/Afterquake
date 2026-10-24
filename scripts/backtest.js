// Regional occurrence checks, shared with the Accuracy tab. No network required.
// npm run backtest [-- --json]
const fs = require('node:fs');
const path = require('node:path');
const MODEL = require('../src/model.js');
const VALIDATION = require('../src/validation.js');
const D = require('../data/sequences.json');

const rows = VALIDATION.backtest(D.sequences, MODEL);
const report = {
  datasetFetchedAt: D.fetchedAt,
  scope: 'Retrospective regional M5+/M6+ occurrence, next 7 days. Not validation of local shaking, damage or re-entry.',
  limitations: [
    'Catalogue magnitudes and locations include later revisions; origin-time filtering is not an as-issued hindcast.',
    'Overlapping forecast windows within a sequence are correlated.',
    'The reference excludes the target sequence but is not a chronological holdout.',
    'A single prototype prior is used across tectonic regimes; no time-dependent completeness model or ETAS.',
    'Local shaking uses later ShakeMaps, fixed depth, a fitted soil coefficient and heuristic damage thresholds.'
  ],
  metrics: [5, 6].map(m => VALIDATION.summarize(rows, m))
};
if (process.argv.includes('--json')) {
  const target = path.join(__dirname, '..', 'data', 'validation-report.json');
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(path.relative(process.cwd(), target));
} else {
  console.log(report.scope);
  console.log('Dataset downloaded:', D.fetchedAt);
  for (const st of report.metrics) {
    console.log(`\nM${st.magnitude}+: ${st.forecasts} forecasts, ${st.occurrences} occurrences across ${st.sequences} sequences`);
    console.log(`Mean forecast ${(st.meanForecast * 100).toFixed(1)}%; observed ${(st.observed * 100).toFixed(1)}%`);
    console.log(`Brier ${st.brier.toFixed(3)}; other-sequence reference ${st.heldOutBrier.toFixed(3)}; skill ${st.heldOutSkill.toFixed(2)}`);
    console.log(`Pooled descriptive baseline: Brier ${st.pooledBrier.toFixed(3)}, skill ${st.pooledSkill.toFixed(2)} (uses the evaluated outcomes)`);
    for (const bin of st.reliability) if (bin.count) console.log(
      `  ${Math.round(bin.low * 100)}-${Math.round(bin.high * 100)}%: n=${bin.count}, mean ${(bin.meanForecast * 100).toFixed(0)}%, observed ${(bin.observed * 100).toFixed(0)}%`);
  }
  console.log('\n' + report.limitations.join('\n'));
}
