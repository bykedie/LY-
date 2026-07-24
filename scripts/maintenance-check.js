import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouteMethods } from '../src/api-route-boundary.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function failWhen(condition, message) {
  if (condition) failures.push(message);
}

const dashboardRouteMethods = new Map();
for (const match of read('src/dashboard.js').matchAll(/req\.method === '([^']+)' && url\.pathname === '([^']+)'/g)) {
  const methods = dashboardRouteMethods.get(match[2]) || new Set();
  methods.add(match[1]);
  dashboardRouteMethods.set(match[2], methods);
}
const dashboardRoutes = new Set(dashboardRouteMethods.keys());
const testSource = fs.readdirSync(path.join(projectRoot, 'scripts'))
  .filter((name) => name.endsWith('-test.js'))
  .map((name) => read(path.join('scripts', name)))
  .join('\n');
const uncoveredRoutes = [...dashboardRoutes].filter((route) => !testSource.includes(route)).sort();
failWhen(uncoveredRoutes.length > 0, `Dashboard API 缺少测试引用：${uncoveredRoutes.join(', ')}`);
const boundaryRoutes = new Set(apiRouteMethods.keys());
const missingBoundaryRoutes = [...dashboardRoutes].filter((route) => !boundaryRoutes.has(route)).sort();
const staleBoundaryRoutes = [...boundaryRoutes].filter((route) => !dashboardRoutes.has(route)).sort();
failWhen(missingBoundaryRoutes.length > 0, `API 方法边界缺少路由：${missingBoundaryRoutes.join(', ')}`);
failWhen(staleBoundaryRoutes.length > 0, `API 方法边界包含过期路由：${staleBoundaryRoutes.join(', ')}`);
const methodMismatches = [...dashboardRouteMethods].filter(([route, methods]) => {
  return [...methods].sort().join(',') !== [...(apiRouteMethods.get(route) || [])].sort().join(',');
}).map(([route]) => route).sort();
failWhen(methodMismatches.length > 0, `API 方法边界与实现不一致：${methodMismatches.join(', ')}`);

function selectors(relativePath) {
  const source = read(relativePath).replace(/\/\*[\s\S]*?\*\//g, '');
  const result = new Set();
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('@')) continue;
    for (const selector of raw.split(',')) {
      const normalized = selector.trim().replace(/\s+/g, ' ');
      if (!normalized || normalized === 'from' || normalized === 'to' || /^\d+%$/.test(normalized)) continue;
      result.add(normalized);
    }
  }
  return result;
}

const baseSelectors = selectors('public/styles.css');
const workbenchSelectors = selectors('public/workbench.css');
const selectorOverlap = [...baseSelectors].filter((selector) => workbenchSelectors.has(selector));
const importantCount = (read('public/styles.css').match(/!important/g) || []).length
  + (read('public/workbench.css').match(/!important/g) || []).length;
const cssBaseline = { selectorOverlap: 80, importantCount: 12 };
failWhen(
  selectorOverlap.length > cssBaseline.selectorOverlap,
  `CSS 完全重复选择器由基线 ${cssBaseline.selectorOverlap} 增至 ${selectorOverlap.length}；请合并职责或更新经审阅的基线。`
);
failWhen(
  importantCount > cssBaseline.importantCount,
  `CSS !important 由基线 ${cssBaseline.importantCount} 增至 ${importantCount}；请消除新增优先级覆盖。`
);

const lineBudgets = {
  'src/index.js': 2300,
  'public/app.js': 1800,
  'src/dashboard.js': 1050,
  'public/styles.css': 2450,
  'public/workbench.css': 550
};
const lineCounts = {};
for (const [relativePath, budget] of Object.entries(lineBudgets)) {
  const lineCount = read(relativePath).split(/\r?\n/).length;
  lineCounts[relativePath] = lineCount;
  failWhen(lineCount > budget, `${relativePath} 已达 ${lineCount} 行，超过维护预算 ${budget}；应随当前功能做小范围拆分。`);
}

if (failures.length > 0) {
  console.error('maintenance check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `maintenance check ok (api=${dashboardRoutes.size}, css-overlap=${selectorOverlap.length}/${cssBaseline.selectorOverlap}, `
  + `important=${importantCount}/${cssBaseline.importantCount}, files=${JSON.stringify(lineCounts)})`
);
