import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`缺少关键文件：${relativePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function section(document, heading) {
  const marker = `## ${heading}`;
  const start = document.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const next = document.indexOf('\n## ', contentStart);
  return document.slice(contentStart, next < 0 ? undefined : next).trim();
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

const requiredFiles = [
  'AGENTS.md',
  'docs/current-status.md',
  'docs/project-architecture.md',
  'docs/decisions.md',
  'docs/ideas.md',
  'docs/work-log.md',
  'docs/next-ai-prompt.md',
  'docs/conversation-handoff.md',
  'docs/ubuntu-24.04-deploy.md',
  'bot.config.example.json',
  'src/dashboard.js',
  'src/config-schema.js',
  'src/execution-config.js',
  'src/api-route-boundary.js',
  'src/http-server-listener.js',
  'src/json-request.js',
  'src/automation-store.js',
  'src/json-store.js',
  'src/line-reader.js',
  'src/process-ipc.js',
  'src/process-lifecycle.js',
  'src/runtime-request-tracker.js',
  'src/runtime-snapshot.js',
  'src/session-state.js',
  'src/static-server.js',
  'public/api-client.js',
  'scripts/security-audit.js',
  'src/index.js',
  'public/index.html',
  'public/styles.css',
  'public/workbench.css',
  'public/app.js',
  'public/log-renderer.js'
];

for (const relativePath of requiredFiles) read(relativePath);

const handoffDocuments = requiredFiles.filter((relativePath) => relativePath === 'AGENTS.md' || relativePath.startsWith('docs/'));
for (const relativePath of handoffDocuments) {
  const content = read(relativePath);
  requireCondition(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(content), `交接文档包含隐藏控制字符：${relativePath}`);
  const escapedLineBreak = String.fromCharCode(96, 110, 45);
  requireCondition(!content.includes(escapedLineBreak), `交接文档包含字面量转义换行：${relativePath}`);
}

const documentedCommitRefs = new Set();
for (const relativePath of handoffDocuments) {
  for (const match of read(relativePath).matchAll(/`([0-9a-f]{7})`/g)) documentedCommitRefs.add(match[1]);
}
for (const commitRef of documentedCommitRefs) {
  const result = spawnSync('git', ['cat-file', '-e', `${commitRef}^{commit}`], { cwd: projectRoot });
  requireCondition(result.status === 0, `交接文档引用了不存在的 Git 提交：${commitRef}`);
}

const status = read('docs/current-status.md');
const decisions = read('docs/decisions.md');
const ideas = read('docs/ideas.md');
const agents = read('AGENTS.md');
const architecture = read('docs/project-architecture.md');

const requiredStatusSections = [
  '当前稳定版本',
  '当前本地开发版本',
  '当前本地分支',
  '当前目标',
  '本轮需求和验收标准',
  '已完成事项',
  '正在进行事项',
  '下一步明确动作',
  '已修改文件',
  '未解决问题和阻塞项',
  '最近测试结果',
  '恢复开发命令',
  '是否允许推送',
  '最后更新时间'
];

for (const heading of requiredStatusSections) {
  requireCondition(Boolean(section(status, heading)), `当前状态缺少内容：${heading}`);
}

const stableVersion = section(status, '当前稳定版本').match(/`(v\d+\.\d+\.\d+)`/)?.[1];
const developmentVersion = section(status, '当前本地开发版本').match(/`(v\d+\.\d+\.\d+)`/)?.[1];
const documentedBranch = section(status, '当前本地分支').match(/`([^`]+)`/)?.[1];
const gitBranchResult = spawnSync('git', ['branch', '--show-current'], { cwd: projectRoot, encoding: 'utf8' });
const actualBranch = gitBranchResult.stdout.trim();
const diffCheckResult = spawnSync('git', ['diff', '--check'], { cwd: projectRoot, encoding: 'utf8' });
requireCondition(diffCheckResult.status === 0, `Git 差异包含格式错误：${diffCheckResult.stdout.trim() || diffCheckResult.stderr.trim()}`);

function parseVersion(version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const stableParts = parseVersion(stableVersion);
const developmentParts = parseVersion(developmentVersion);
requireCondition(Boolean(stableParts), '当前稳定版本必须使用 v主版本.次版本.修订号 格式。');
requireCondition(Boolean(developmentParts), '当前本地开发版本必须使用 v主版本.次版本.修订号 格式。');
if (stableParts && developmentParts) {
  requireCondition(compareVersions(developmentParts, stableParts) > 0, '当前本地开发版本必须高于稳定版本。');
}
requireCondition(documentedBranch === `local/${developmentVersion}`, '当前本地分支必须使用 local/<当前本地开发版本>。');
requireCondition(actualBranch === documentedBranch, `Git 当前分支 ${actualBranch || '(未知)'} 与交接记录 ${documentedBranch || '(缺失)'} 不一致。`);
requireCondition(decisions.includes(`\`${stableVersion}\``) && decisions.includes(`\`${developmentVersion}\``), '决策记录缺少稳定版或开发版约定。');
requireCondition(architecture.includes(`\`${stableVersion}\``), '架构文档缺少当前稳定架构基线。');

const pushPermission = section(status, '是否允许推送');
requireCondition(/^否[。\s]/.test(pushPermission), '推送许可必须存在并默认明确为“否”。');
requireCondition(agents.includes('禁止执行 `git push`'), 'AGENTS.md 缺少未经许可禁止推送规则。');

const nextAction = section(status, '下一步明确动作');
requireCondition(nextAction.length >= 10 && !/^(无|暂无|待定)[。\s]*$/.test(nextAction), '当前状态必须提供具体的下一步明确动作。');

function checkUniqueHeadings(document, prefix, label) {
  const ids = [...document.matchAll(new RegExp(`^## ${prefix}-(\\d{3})：`, 'gm'))].map((match) => match[1]);
  requireCondition(ids.length > 0, `${label}没有有效编号记录。`);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  requireCondition(duplicates.length === 0, `${label}存在重复编号：${[...new Set(duplicates)].join(', ')}`);
}

checkUniqueHeadings(ideas, 'IDEA', '想法台账');
checkUniqueHeadings(decisions, 'DEC', '决策记录');

const runtimePaths = [
  '.env',
  'bot.config.json',
  'accounts.json',
  'bot.config.profiles/profiles.json',
  'bot.config.automations.json',
  '.bot.config.json.transaction-check-0.tmp',
  '.bot.config.json.transaction-check-0.bak',
  '.json-transaction-check.journal.json',
  '.json-transaction-check.journal.json.tmp'
];

for (const runtimePath of runtimePaths) {
  const result = spawnSync('git', ['check-ignore', '-q', runtimePath], { cwd: projectRoot });
  requireCondition(result.status === 0, `运行时文件未被 .gitignore 排除：${runtimePath}`);
}

if (failures.length > 0) {
  console.error('handoff check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`handoff check ok (${stableVersion} -> ${developmentVersion}, ${actualBranch}, push: no)`);
