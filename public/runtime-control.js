export function collapseAccountLogs(lines = []) {
  const collapsed = [];
  let group = null;

  for (const line of lines) {
    const parsed = parseAccountLog(line);
    if (!parsed || parsed.account === '系统' || !group || group.message !== parsed.message || group.accounts.includes(parsed.account)) {
      flushGroup(collapsed, group);
      group = parsed && parsed.account !== '系统'
        ? { timestamp: parsed.timestamp, accounts: [parsed.account], message: parsed.message, original: line }
        : null;
      if (!group) collapsed.push(line);
      continue;
    }
    group.accounts.push(parsed.account);
  }
  flushGroup(collapsed, group);
  return collapsed;
}

export function shouldFollowLogTail(element, threshold = 24) {
  if (!element) return false;
  return element.scrollHeight - element.clientHeight - element.scrollTop <= threshold;
}

export function renderRuntimeLogs(element, lines, renderLines) {
  if (!element) return;
  const followTail = shouldFollowLogTail(element);
  const previousScrollTop = element.scrollTop;
  if (lines.length) element.innerHTML = renderLines(lines);
  else element.textContent = '等待日志...';
  element.scrollTop = followTail ? element.scrollHeight : previousScrollTop;
}

export function hasLogTextSelection(element, selection = globalThis.getSelection?.()) {
  if (!element || !selection || selection.isCollapsed) return false;
  return [...Array(selection.rangeCount)].some((_, index) => element.contains(selection.getRangeAt(index).commonAncestorContainer));
}

export function renderStopAccountTargets(select, button, accounts = [], enabled = false) {
  if (!select || !button) return;
  const previous = select.value;
  select.innerHTML = '';
  for (const account of accounts) {
    if (!account?.username) continue;
    const option = document.createElement('option');
    option.value = account.username;
    option.textContent = account.username;
    select.appendChild(option);
  }
  select.value = [...select.options].some((option) => option.value === previous) ? previous : (select.options[0]?.value || '');
  select.disabled = !enabled || select.options.length === 0;
  button.disabled = select.disabled;
}

function parseAccountLog(line) {
  const match = String(line).match(/^(\[[^\]]+\]) \[([^\]]+)\] (.+)$/);
  return match ? { timestamp: match[1], account: match[2], message: match[3] } : null;
}

function flushGroup(lines, group) {
  if (!group) return;
  lines.push(group.accounts.length > 1
    ? `${group.timestamp} [${group.accounts.join('、')}] ${group.message}`
    : group.original);
}
