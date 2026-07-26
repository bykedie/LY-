export function getInteractionVisualPoint(event, canvas, visual) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const normalizedX = clamp((Number(event.clientX) - bounds.left) / width, 0, 1);
  const normalizedY = clamp((Number(event.clientY) - bounds.top) / height, 0, 1);
  return {
    x: roundCoordinate(normalizedX * visual.width),
    y: roundCoordinate(normalizedY * visual.height),
    normalizedX: roundCoordinate(normalizedX),
    normalizedY: roundCoordinate(normalizedY)
  };
}

export function hitTestInteractionVisual(visual, x, y) {
  return [...(visual?.elements || [])].reverse().find((element) => (
    x >= element.x
    && y >= element.y
    && x <= element.x + element.width
    && y <= element.y + element.height
  )) || null;
}

export function renderWindowSlotGrid(grid, options = {}) {
  const slotsByIndex = options.slotsByIndex || new Map();
  const inventoryStart = options.inventoryStart;
  grid.innerHTML = '';
  for (let slotIndex = 0; slotIndex <= 80; slotIndex += 1) {
    const slot = slotsByIndex.get(slotIndex) || { slot: slotIndex, item: false, name: '', displayName: '', count: 0, lore: [] };
    const name = slot.displayName || slot.name || '';
    const button = document.createElement('button');
    const selectable = slot.item
      && (slot.protocolEntry || !Number.isInteger(inventoryStart) || slot.slot < inventoryStart)
      && options.isSelectable(slot);
    button.className = `window-slot${selectable ? ' has-item' : ' is-empty'}${slot.protocolEntry ? ' is-protocol-item' : ''}`;
    button.type = 'button';
    const lore = (slot.lore || []).filter(Boolean);
    const detail = lore.length ? `\n提示：${lore.join(' / ')}` : '';
    const source = slot.protocolEntry ? '\n来源：DragonCore 槽位映射' : '';
    button.title = slot.item ? `槽位 ${slot.slot}：${name || '未命名物品'} x${slot.count}${detail}${source}` : `槽位 ${slot.slot}：空`;
    const slotLabel = document.createElement('strong');
    slotLabel.textContent = String(slot.slot);
    button.appendChild(slotLabel);
    if (selectable) {
      const itemLabel = document.createElement('span');
      itemLabel.textContent = name || '物品';
      button.appendChild(itemLabel);
      button.addEventListener('click', () => options.onSelect(slot));
    } else {
      button.disabled = true;
    }
    grid.appendChild(button);
  }
}

export function createInteractionVisualView(options = {}) {
  const panel = document.querySelector('#interactionVisualPanel');
  const canvas = document.querySelector('#interactionVisualCanvas');
  const empty = document.querySelector('#interactionVisualEmpty');
  const title = document.querySelector('#interactionVisualTitle');
  const source = document.querySelector('#interactionVisualSource');
  const notice = document.querySelector('#interactionVisualNotice');
  const selectionLabel = document.querySelector('#interactionVisualSelection');
  const leftButton = document.querySelector('#interactionVisualLeftBtn');
  const rightButton = document.querySelector('#interactionVisualRightBtn');
  const clearButton = document.querySelector('#interactionVisualClearBtn');
  const rawDetails = document.querySelector('#interactionVisualRaw');
  const rawContent = document.querySelector('#interactionVisualRawContent');
  if (!panel || !canvas || !empty || !title || !source || !notice || !selectionLabel) {
    return { render() {}, getVisual: () => null };
  }

  let visual = null;
  let selection = null;
  let busy = false;

  canvas.addEventListener('click', (event) => {
    if (!visual || busy) return;
    const point = getInteractionVisualPoint(event, canvas, visual);
    selection = { ...point, hit: hitTestInteractionVisual(visual, point.x, point.y) };
    updateSelection();
    drawInteractionVisual(canvas, visual, selection);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  leftButton?.addEventListener('click', () => void execute('left'));
  rightButton?.addEventListener('click', () => void execute('right'));
  clearButton?.addEventListener('click', () => {
    selection = null;
    updateSelection();
    drawInteractionVisual(canvas, visual, selection);
  });

  function render(nextVisual) {
    visual = nextVisual || null;
    selection = visual?.selection
      ? { ...visual.selection, hit: hitTestInteractionVisual(visual, visual.selection.x, visual.selection.y) }
      : null;
    canvas.hidden = !visual;
    empty.hidden = Boolean(visual);
    title.textContent = visual?.title || '交互界面预览';
    source.textContent = visual ? `${visual.sourceLabel || visual.kind} · 协议重建图` : '等待 NPC 交互';
    notice.textContent = visual
      ? [visual.description, visual.notice].filter(Boolean).join(' ')
      : '与 NPC 左键或右键交互后，标准窗口或模组协议会在这里重建为可选点画面。';
    renderRawSignals(rawDetails, rawContent, visual?.rawSignals || []);
    updateSelection();
    drawInteractionVisual(canvas, visual, selection);
  }

  async function execute(button) {
    if (!visual || !selection || busy || typeof options.onExecute !== 'function') return;
    busy = true;
    updateSelection();
    try {
      await options.onExecute({
        visualId: visual.id,
        x: selection.x,
        y: selection.y,
        normalizedX: selection.normalizedX,
        normalizedY: selection.normalizedY,
        button
      });
    } catch (error) {
      options.onError?.(error);
    } finally {
      busy = false;
      updateSelection();
    }
  }

  function updateSelection() {
    const selected = Boolean(visual && selection);
    if (!selected) {
      selectionLabel.textContent = visual ? '请在图中点击一个位置' : '尚无可选点界面';
    } else {
      const hit = selection.hit?.label ? `；命中：${selection.hit.label}` : '；未命中已识别控件';
      selectionLabel.textContent = `画面坐标 X ${formatCoordinate(selection.x)} / Y ${formatCoordinate(selection.y)}；归一化 ${formatCoordinate(selection.normalizedX)} / ${formatCoordinate(selection.normalizedY)}${hit}`;
    }
    for (const button of [leftButton, rightButton]) {
      if (button) button.disabled = !selected || busy;
    }
    if (clearButton) clearButton.disabled = !selected || busy;
  }

  render(null);
  return { render, getVisual: () => visual };
}

export function drawInteractionVisual(canvas, visual, selection = null) {
  if (!canvas || !visual) return;
  const ratio = Math.max(1, Math.min(2, Number(globalThis.devicePixelRatio) || 1));
  canvas.width = Math.round(visual.width * ratio);
  canvas.height = Math.round(visual.height * ratio);
  canvas.style.aspectRatio = `${visual.width} / ${visual.height}`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, visual.width, visual.height);

  const background = context.createLinearGradient(0, 0, visual.width, visual.height);
  background.addColorStop(0, '#18252d');
  background.addColorStop(1, '#0e171d');
  context.fillStyle = background;
  context.fillRect(0, 0, visual.width, visual.height);
  drawHeader(context, visual);
  drawSections(context, visual.sections || []);

  if ((visual.elements || []).length === 0) drawProtocolFallback(context, visual);
  for (const element of visual.elements || []) drawElement(context, element);
  if (selection) drawSelection(context, selection);
}

function drawHeader(context, visual) {
  context.fillStyle = 'rgba(255, 255, 255, 0.06)';
  context.fillRect(0, 0, visual.width, 58);
  context.fillStyle = '#f7fafc';
  context.font = '700 18px system-ui, sans-serif';
  context.fillText(truncateText(context, visual.title || '交互界面', visual.width - 56), 28, 30);
  context.fillStyle = '#91a9b6';
  context.font = '12px system-ui, sans-serif';
  context.fillText(truncateText(context, visual.sourceLabel || visual.kind || '', visual.width - 56), 28, 49);
}

function drawSections(context, sections) {
  context.font = '12px system-ui, sans-serif';
  for (const section of sections) {
    context.strokeStyle = 'rgba(160, 188, 201, 0.22)';
    context.strokeRect(section.x - 10, section.y - 6, section.width + 20, section.height + 12);
    context.fillStyle = '#a9bec9';
    context.fillText(section.label || '', section.x, section.y + 8);
  }
}

function drawElement(context, element) {
  if (element.type === 'slot') {
    context.fillStyle = element.protocolEntry ? '#2f5769' : (element.item ? '#30444f' : '#202f37');
    context.strokeStyle = element.item ? '#82b9c2' : '#41545e';
    context.lineWidth = element.item ? 2 : 1;
    context.fillRect(element.x, element.y, element.width, element.height);
    context.strokeRect(element.x + 0.5, element.y + 0.5, element.width - 1, element.height - 1);
    context.fillStyle = '#8299a5';
    context.font = '10px ui-monospace, monospace';
    context.fillText(String(element.slot), element.x + 4, element.y + 11);
    if (element.item) {
      context.fillStyle = '#f4f8fa';
      context.font = '600 10px system-ui, sans-serif';
      drawCenteredText(context, element.label, element.x + 4, element.y + 17, element.width - 8, 2, 11);
    }
    return;
  }

  context.fillStyle = element.supported === false ? '#3d4144' : '#225a68';
  context.strokeStyle = element.supported === false ? '#747b80' : '#70c1c8';
  context.lineWidth = 1.5;
  roundedRect(context, element.x, element.y, element.width, element.height, 7);
  context.fill();
  context.stroke();
  context.fillStyle = element.supported === false ? '#c5c9cb' : '#f7fbfc';
  context.font = '700 14px system-ui, sans-serif';
  context.fillText(truncateText(context, element.label || element.id, element.width - 24), element.x + 12, element.y + 21);
  if (element.detail) {
    context.fillStyle = '#a9bec9';
    context.font = '11px system-ui, sans-serif';
    context.fillText(truncateText(context, element.detail, element.width - 24), element.x + 12, element.y + 37);
  }
}

function drawProtocolFallback(context, visual) {
  context.fillStyle = 'rgba(255, 255, 255, 0.045)';
  roundedRect(context, 34, 82, visual.width - 68, visual.height - 116, 8);
  context.fill();
  context.fillStyle = '#dce8ed';
  context.font = '13px ui-monospace, monospace';
  drawWrappedText(context, visual.description || '检测到未识别协议。', 52, 110, visual.width - 104, 19, Math.max(3, Math.floor((visual.height - 150) / 19)));
}

function drawSelection(context, selection) {
  const x = Number(selection.x);
  const y = Number(selection.y);
  context.save();
  context.strokeStyle = '#ffca5c';
  context.fillStyle = '#ffca5c';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(x - 14, y);
  context.lineTo(x + 14, y);
  context.moveTo(x, y - 14);
  context.lineTo(x, y + 14);
  context.stroke();
  context.font = '11px ui-monospace, monospace';
  const label = `${formatCoordinate(x)}, ${formatCoordinate(y)}`;
  const labelWidth = context.measureText(label).width + 12;
  const labelX = Math.min(Math.max(4, x + 12), context.canvas.width - labelWidth - 4);
  const labelY = Math.max(18, y - 12);
  context.fillStyle = 'rgba(8, 14, 18, 0.86)';
  context.fillRect(labelX, labelY - 14, labelWidth, 18);
  context.fillStyle = '#ffdc88';
  context.fillText(label, labelX + 6, labelY);
  context.restore();
}

function renderRawSignals(details, content, signals) {
  if (!details || !content) return;
  details.hidden = signals.length === 0;
  content.textContent = signals.map((signal, index) => {
    const meta = `${index + 1}. ${signal.channel || '未知通道'}${signal.packetType ? ` / ${signal.packetType}` : ''} · ${signal.size || 0} bytes${signal.truncated ? ' · 已截取显示' : ''}`;
    return `${meta}\n${signal.text || `[${signal.encoding || 'binary'} 数据，无可读文本]`}`;
  }).join('\n\n');
}

function roundedRect(context, x, y, width, height, radius) {
  const limitedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, limitedRadius);
}

function truncateText(context, text, maxWidth) {
  const value = String(text || '');
  if (context.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}

function drawCenteredText(context, text, x, y, width, maxLines, lineHeight) {
  const lines = wrapText(context, text, width, maxLines);
  lines.forEach((line, index) => {
    const textWidth = context.measureText(line).width;
    context.fillText(line, x + Math.max(0, (width - textWidth) / 2), y + index * lineHeight);
  });
}

function drawWrappedText(context, text, x, y, width, lineHeight, maxLines) {
  wrapText(context, text, width, maxLines).forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function wrapText(context, text, width, maxLines) {
  const characters = [...String(text || '')];
  const lines = [];
  let current = '';
  for (const character of characters) {
    if (character === '\n' || context.measureText(current + character).width > width) {
      if (current) lines.push(current);
      current = character === '\n' ? '' : character;
      if (lines.length >= maxLines) break;
    } else {
      current += character;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && characters.length > lines.join('').length) lines[maxLines - 1] = truncateText(context, lines[maxLines - 1], width);
  return lines;
}

function formatCoordinate(value) {
  return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 10000) / 10000;
}
