import { renderLogLines, renderMinecraftText } from '../public/log-renderer.js';

const colored = renderMinecraftText('§a成功 §l粗体§r <script>alert(1)</script>');
assert(colored.includes('mc-color-a'), '绿色 MC 色码没有渲染为 class');
assert(colored.includes('mc-format-bold'), '粗体 MC 格式码没有渲染为 class');
assert(colored.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), '日志内容没有安全转义');
assert(!colored.includes('<script>'), '日志渲染不应该输出可执行 script 标签');

const reset = renderMinecraftText('§c红色§r默认');
assert(reset.includes('mc-color-c'), '红色 MC 色码没有渲染为 class');
assert(reset.endsWith('默认'), 'reset 后的普通文本没有保留');
assert(!reset.endsWith('</span>'), 'reset 后的普通文本不应该继续套用前一个颜色');

const multiLine = renderLogLines(['第一行', '§e第二行']);
assert(multiLine.includes('\n'), '多行日志应该保留换行');
assert(multiLine.includes('mc-color-e'), '多行日志没有渲染第二行色码');

const hexColor = renderMinecraftText('§#FF0000红色 & <tag>');
assert(hexColor.includes('style="color:#FF0000"'), '十六进制 MC 色码没有渲染为内联颜色');
assert(hexColor.includes('&lt;tag&gt;'), '十六进制颜色文本没有安全转义');

console.log('log renderer test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
