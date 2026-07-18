const MC_COLOR_CLASSES = {
  0: 'mc-color-0',
  1: 'mc-color-1',
  2: 'mc-color-2',
  3: 'mc-color-3',
  4: 'mc-color-4',
  5: 'mc-color-5',
  6: 'mc-color-6',
  7: 'mc-color-7',
  8: 'mc-color-8',
  9: 'mc-color-9',
  a: 'mc-color-a',
  b: 'mc-color-b',
  c: 'mc-color-c',
  d: 'mc-color-d',
  e: 'mc-color-e',
  f: 'mc-color-f'
};

const MC_FORMAT_CLASSES = {
  l: 'mc-format-bold',
  m: 'mc-format-strike',
  n: 'mc-format-underline',
  o: 'mc-format-italic'
};

export function renderLogLines(lines = []) {
  return lines.map((line) => renderMinecraftText(line)).join('\n');
}

export function renderMinecraftText(text = '') {
  let html = '';
  let buffer = '';
  let colorClass = '';
  const formatClasses = new Set();

  const flush = () => {
    if (!buffer) return;
    const escaped = escapeHtml(buffer);
    const classes = [colorClass, ...formatClasses].filter(Boolean).join(' ');
    html += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
    buffer = '';
  };

  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\u00a7' || index + 1 >= source.length) {
      buffer += source[index];
      continue;
    }

    if (source[index + 1] === '#' && /^[0-9a-fA-F]{6}$/.test(source.slice(index + 2, index + 8))) {
      flush();
      colorClass = '';
      formatClasses.clear();
      const color = source.slice(index + 1, index + 8);
      const hexBuffer = [];
      index += 7;

      while (index + 1 < source.length && source[index + 1] !== '\u00a7') {
        index += 1;
        hexBuffer.push(source[index]);
      }

      html += `<span style="color:${color}">${escapeHtml(hexBuffer.join(''))}</span>`;
      continue;
    }

    const code = source[index + 1].toLowerCase();
    if (code === 'r') {
      flush();
      colorClass = '';
      formatClasses.clear();
      index += 1;
      continue;
    }

    if (MC_COLOR_CLASSES[code]) {
      flush();
      colorClass = MC_COLOR_CLASSES[code];
      formatClasses.clear();
      index += 1;
      continue;
    }

    if (MC_FORMAT_CLASSES[code]) {
      flush();
      formatClasses.add(MC_FORMAT_CLASSES[code]);
      index += 1;
      continue;
    }

    buffer += source[index];
  }

  flush();
  return html;
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
