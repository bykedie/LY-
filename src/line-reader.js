export function createLineReader(onLine) {
  let buffer = '';

  function push(chunk) {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) onLine(line);
  }

  function end() {
    if (buffer) onLine(buffer);
    buffer = '';
  }

  return { push, end };
}
