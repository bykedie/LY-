import { createLineReader } from '../src/line-reader.js';

const firstLines = [];
const firstReader = createLineReader((line) => firstLines.push(line));
firstReader.push('first\npartial');
assert(firstLines.join('|') === 'first', '分块读取器提前输出了半行');
firstReader.push('-line\r\nlast');
firstReader.end();
assert(firstLines.join('|') === 'first|partial-line|last', '分块和尾行没有按顺序输出');

const secondLines = [];
const secondReader = createLineReader((line) => secondLines.push(line));
secondReader.push('new-process\n');
secondReader.end();
assert(secondLines.join('|') === 'new-process', '新读取器继承了旧进程半行');
assert(!secondLines.join('').includes('partial'), '跨进程行缓冲发生污染');

console.log('line reader test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
