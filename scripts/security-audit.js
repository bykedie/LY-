import { spawnSync } from 'node:child_process';

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath ? [npmExecPath, 'audit', '--omit=dev', '--json'] : ['audit', '--omit=dev', '--json'];
const result = spawnSync(command, args, {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
  shell: !npmExecPath && process.platform === 'win32'
});

if (result.error) {
  console.error(`无法运行 npm audit：${result.error.message}`);
  process.exit(1);
}
if (!result.stdout?.trim()) {
  console.error(result.stderr?.trim() || 'npm audit 没有返回结果。');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('npm audit 返回了无法解析的 JSON。');
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities || {};
const high = Number(counts.high || 0);
const critical = Number(counts.critical || 0);
if (high > 0 || critical > 0) {
  console.error(`security audit failed (high=${high}, critical=${critical})`);
  process.exit(1);
}

const moderatePackages = Object.entries(report.vulnerabilities || {})
  .filter(([, vulnerability]) => vulnerability.severity === 'moderate')
  .map(([name]) => name)
  .sort();
console.log(
  `security audit ok (critical=${critical}, high=${high}, moderate=${Number(counts.moderate || 0)}, `
  + `packages=${moderatePackages.join(',') || 'none'})`
);
