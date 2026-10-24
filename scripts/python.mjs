// Run Python with whichever command this machine has: `python3` on most Linux/macOS, `python` or `py -3` on Windows.
// Used by the npm scripts, e.g.  node scripts/python.mjs scripts/build.py
// Each candidate is checked with --version first, so the Windows Store "python3" stub (exit 9009) is skipped.
import { spawnSync } from 'node:child_process';

const CANDIDATES = process.platform === 'win32' ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
const found = CANDIDATES.find(([cmd, ...pre]) => spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore' }).status === 0);
if (!found) {
  console.error('Python 3 not found. Install it (plus numpy for `npm run fit`) and try again.');
  process.exit(1);
}
const [cmd, ...pre] = found;
const r = spawnSync(cmd, [...pre, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
