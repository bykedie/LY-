import { createHash } from 'node:crypto';

const MAX_PROTOCOL_TEXT_LENGTH = 16 * 1024;
const MAX_VISUAL_SIGNAL_TEXT_LENGTH = 8 * 1024;
const SLOT_SIZE = 42;
const SLOT_GAP = 6;
const PANEL_PADDING = 28;

export function extractProtocolPayloadText(input, maxLength = MAX_PROTOCOL_TEXT_LENGTH) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!data.length) return '';
  const text = data.toString('utf8')
    .replace(/\uFFFD/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || (!/[\u3400-\u9fff]/u.test(text) && !/[a-z]{4,}/i.test(text))) return '';
  return text.slice(0, Math.max(1, Number(maxLength) || MAX_PROTOCOL_TEXT_LENGTH));
}

export function createInteractionVisualSnapshot(snapshot = {}) {
  const rawSignals = normalizeRawSignals(snapshot.protocolDialogs);
  let visual = null;
  const latestButton = latestChatButton(snapshot.chatButtons);
  const sources = [
    snapshot.window && { kind: 'container', at: Number(snapshot.window.at) || 0 },
    snapshot.npcDialog && { kind: 'custom-npcs', at: Number(snapshot.npcDialog.at) || 0 },
    snapshot.protocolMenu && { kind: 'dragoncore', at: Number(snapshot.protocolMenu.at) || 0 },
    latestButton && { kind: 'chat', at: Number(latestButton.at) || 0 },
    rawSignals.at(-1) && { kind: 'protocol', at: Number(rawSignals.at(-1).at) || 0 }
  ].filter(Boolean).sort((left, right) => right.at - left.at);
  const sourceKind = sources[0]?.kind;
  if (sourceKind === 'container') visual = createContainerVisual(snapshot.window, snapshot.protocolMenu, rawSignals);
  else if (sourceKind === 'custom-npcs') visual = createCustomNpcsVisual(snapshot.npcDialog, rawSignals);
  else if (sourceKind === 'dragoncore') visual = createDragonCoreVisual(snapshot.protocolMenu, rawSignals);
  else if (sourceKind === 'chat') visual = createChatVisual(snapshot.chatButtons, rawSignals);
  else if (sourceKind === 'protocol') visual = createProtocolVisual(rawSignals);

  if (!visual) return null;
  visual.id = createVisualId(visual);
  const selection = snapshot.selection;
  if (selection?.visualId === visual.id) visual.selection = { ...selection };
  return visual;
}

export function normalizeInteractionVisualClick(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('界面选点必须是对象。');
  const visualId = String(input.visualId || '').trim();
  const x = Number(input.x);
  const y = Number(input.y);
  const button = String(input.button || '').trim().toLowerCase();
  if (!visualId || visualId.length > 96) throw new Error('界面选点缺少有效快照 ID。');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('界面选点坐标必须是数字。');
  if (x < 0 || y < 0 || x > 10000 || y > 10000) throw new Error('界面选点坐标超出允许范围。');
  if (!['left', 'right'].includes(button)) throw new Error('界面选点鼠标键必须是 left 或 right。');
  return { visualId, x: roundCoordinate(x), y: roundCoordinate(y), button };
}

export function resolveInteractionVisualClick(visual, clickInput) {
  const click = normalizeInteractionVisualClick(clickInput);
  if (!visual) throw new Error('当前没有可选点的交互界面，请先与 NPC 交互并刷新。');
  if (visual.id !== click.visualId) throw new Error('交互界面已经变化，请刷新后重新选点。');
  if (click.x > visual.width || click.y > visual.height) throw new Error('选点不在当前交互界面范围内。');

  const element = [...(visual.elements || [])].reverse().find((item) => pointInside(click, item)) || null;
  const selection = {
    visualId: visual.id,
    x: click.x,
    y: click.y,
    normalizedX: roundCoordinate(click.x / visual.width),
    normalizedY: roundCoordinate(click.y / visual.height),
    button: click.button,
    hitId: element?.id || '',
    hitLabel: element?.label || ''
  };
  return { selection, element, action: element?.action || null };
}

function createContainerVisual(windowSnapshot, protocolMenu, rawSignals) {
  const slots = new Map((Array.isArray(windowSnapshot.slots) ? windowSnapshot.slots : [])
    .filter((slot) => Number.isInteger(slot?.slot) && slot.slot >= 0)
    .map((slot) => [slot.slot, slot]));
  const protocolEntries = new Map((Array.isArray(protocolMenu?.entries) ? protocolMenu.entries : [])
    .filter((entry) => Number.isInteger(entry?.slot) && entry.slot >= 0)
    .map((entry) => [entry.slot, entry]));
  const slotCount = slots.size ? Math.max(...slots.keys()) + 1 : 0;
  const inventoryStart = Number.isInteger(windowSnapshot.inventoryStart)
    ? Math.max(0, windowSnapshot.inventoryStart)
    : Math.min(slotCount, 54);
  const menuCount = inventoryStart || slotCount;
  const menuColumns = inferWindowColumns(windowSnapshot.type, menuCount);
  const menuRows = Math.max(1, Math.ceil(Math.max(1, menuCount) / menuColumns));
  const inventoryCount = Math.max(0, Math.min(36, slotCount - inventoryStart));
  const contentWidth = Math.max(menuColumns, inventoryCount ? 9 : 0) * SLOT_SIZE
    + Math.max(0, Math.max(menuColumns, inventoryCount ? 9 : 0) - 1) * SLOT_GAP;
  const width = Math.max(460, PANEL_PADDING * 2 + contentWidth);
  const elements = [];
  const sections = [];
  let cursorY = 76;

  sections.push({ label: '交互容器', x: PANEL_PADDING, y: cursorY - 22, width: contentWidth, height: menuRows * SLOT_SIZE + (menuRows - 1) * SLOT_GAP + 22 });
  for (let slotIndex = 0; slotIndex < menuCount; slotIndex += 1) {
    elements.push(createSlotElement(slotIndex, slotIndex, menuColumns, cursorY, width, slots.get(slotIndex), protocolEntries.get(slotIndex), 'container'));
  }
  cursorY += menuRows * SLOT_SIZE + Math.max(0, menuRows - 1) * SLOT_GAP;

  if (inventoryCount > 0) {
    cursorY += 46;
    const inventoryRows = Math.min(3, Math.ceil(Math.min(27, inventoryCount) / 9));
    sections.push({ label: '玩家背包', x: PANEL_PADDING, y: cursorY - 22, width: 9 * SLOT_SIZE + 8 * SLOT_GAP, height: inventoryRows * SLOT_SIZE + Math.max(0, inventoryRows - 1) * SLOT_GAP + 22 });
    const mainInventoryCount = Math.min(27, inventoryCount);
    for (let offset = 0; offset < mainInventoryCount; offset += 1) {
      const slotIndex = inventoryStart + offset;
      elements.push(createSlotElement(slotIndex, offset, 9, cursorY, width, slots.get(slotIndex), null, 'inventory'));
    }
    cursorY += inventoryRows * SLOT_SIZE + Math.max(0, inventoryRows - 1) * SLOT_GAP;

    const hotbarCount = Math.min(9, inventoryCount - mainInventoryCount);
    if (hotbarCount > 0) {
      cursorY += 18;
      sections.push({ label: '快捷栏', x: PANEL_PADDING, y: cursorY - 18, width: 9 * SLOT_SIZE + 8 * SLOT_GAP, height: SLOT_SIZE + 18 });
      for (let offset = 0; offset < hotbarCount; offset += 1) {
        const slotIndex = inventoryStart + mainInventoryCount + offset;
        elements.push(createSlotElement(slotIndex, offset, 9, cursorY, width, slots.get(slotIndex), null, 'hotbar'));
      }
      cursorY += SLOT_SIZE;
    }
  }

  return {
    kind: 'container',
    mode: 'protocol-reconstruction',
    sourceLabel: 'Mineflayer 标准窗口',
    title: String(windowSnapshot.title || '未命名窗口'),
    description: '按标准容器槽位重建；图上槽位可转换为真实窗口点击。',
    notice: '这是协议重建图，不是真人客户端截图。',
    sourceAt: Number(windowSnapshot.at) || 0,
    width,
    height: cursorY + PANEL_PADDING,
    sections,
    elements,
    rawSignals
  };
}

function createSlotElement(slotIndex, offset, columns, top, visualWidth, slot, protocolEntry, group) {
  const row = Math.floor(offset / columns);
  const column = offset % columns;
  const gridWidth = columns * SLOT_SIZE + Math.max(0, columns - 1) * SLOT_GAP;
  const x = Math.round((visualWidth - gridWidth) / 2) + column * (SLOT_SIZE + SLOT_GAP);
  const name = String(protocolEntry?.name || slot?.displayName || slot?.name || '').trim();
  const lore = Array.isArray(protocolEntry?.lore) && protocolEntry.lore.length
    ? protocolEntry.lore
    : (Array.isArray(slot?.lore) ? slot.lore : []);
  return {
    id: `slot:${slotIndex}`,
    type: 'slot',
    group,
    x,
    y: top + row * (SLOT_SIZE + SLOT_GAP),
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    label: name || `槽位 ${slotIndex}`,
    detail: lore.filter(Boolean).join(' / '),
    slot: slotIndex,
    item: Boolean(slot?.item || protocolEntry),
    protocolEntry: Boolean(protocolEntry),
    supported: true,
    action: { kind: 'windowSlot', slot: slotIndex }
  };
}

function createCustomNpcsVisual(dialog, rawSignals) {
  const options = Array.isArray(dialog?.options) ? dialog.options : [];
  const elements = options.map((option, index) => ({
    id: `customNpcs:${dialog.dialogId}:${option.optionId}`,
    type: 'button',
    x: 50,
    y: 148 + index * 58,
    width: 540,
    height: 46,
    label: String(option.title || `选项 ${option.optionId}`),
    detail: option.command || '',
    supported: option.optionType !== 2,
    action: { kind: 'customNpcs', dialogId: dialog.dialogId, optionId: option.optionId }
  }));
  return {
    kind: 'custom-npcs',
    mode: 'protocol-reconstruction',
    sourceLabel: 'CustomNPCs 协议',
    title: String(dialog?.title || `CustomNPCs 对话 ${dialog?.dialogId ?? ''}`).trim(),
    description: String(dialog?.text || (dialog?.resolved === false ? '尚未收到对应同步定义。' : '')).trim(),
    notice: dialog?.resolved === false
      ? '只收到对话编号，当前没有可安全构造的选项。'
      : '选项按 CustomNPCs 同步定义重建，可发送真实选择包。',
    sourceAt: Number(dialog?.at) || 0,
    width: 640,
    height: Math.max(260, 176 + options.length * 58),
    sections: [],
    elements,
    rawSignals
  };
}

function createDragonCoreVisual(menu, rawSignals) {
  const entries = Array.isArray(menu?.entries) ? menu.entries : [];
  const elements = entries.map((entry, index) => ({
    id: `dragoncore:${index}:${entry.slot ?? 'unknown'}`,
    type: 'button',
    x: 50,
    y: 116 + index * 58,
    width: 540,
    height: 46,
    label: String(entry.name || `DragonCore 控件 ${index + 1}`),
    detail: Number.isInteger(entry.slot) ? `检测到槽位映射 ${entry.slot}` : '',
    supported: false,
    action: { kind: 'dragoncore', name: entry.name || '', slot: entry.slot ?? null }
  }));
  return {
    kind: 'dragoncore',
    mode: 'protocol-reconstruction',
    sourceLabel: 'DragonCore 自定义载荷',
    title: String(menu?.title || 'DragonCore 界面'),
    description: '已按收到的按钮名称重建。可在图上选点，但没有底层窗口时不能把像素坐标伪装成客户端点击。',
    notice: '真实点击还需要服务器对应的 GUI 路径、动作名和组件 key。',
    sourceAt: Number(menu?.at) || 0,
    width: 640,
    height: Math.max(260, 144 + entries.length * 58),
    sections: [],
    elements,
    rawSignals
  };
}

function createChatVisual(buttons, rawSignals) {
  const entries = (Array.isArray(buttons) ? buttons : []).slice(-12);
  const elements = entries.map((button, index) => {
    const action = String(button?.action || '').trim();
    return {
      id: `chat:${index}:${action}`,
      type: 'button',
      x: 50,
      y: 116 + index * 58,
      width: 540,
      height: 46,
      label: String(button?.label || button?.value || `聊天按钮 ${index + 1}`),
      detail: String(button?.value || ''),
      supported: ['run_command', 'suggest_command'].includes(action),
      action: { kind: 'chat', action, value: String(button?.value || ''), label: String(button?.label || '') }
    };
  });
  return {
    kind: 'chat',
    mode: 'protocol-reconstruction',
    sourceLabel: 'Minecraft 聊天 clickEvent',
    title: '聊天交互选项',
    description: '按聊天组件 clickEvent 重建。',
    notice: 'run_command 和 suggest_command 可转换为真实聊天/指令。',
    sourceAt: Number(entries.at(-1)?.at) || 0,
    width: 640,
    height: Math.max(260, 144 + entries.length * 58),
    sections: [],
    elements,
    rawSignals
  };
}

function createProtocolVisual(rawSignals) {
  const latest = rawSignals.at(-1);
  return {
    kind: 'protocol',
    mode: 'protocol-reconstruction',
    sourceLabel: String(latest?.channel || '未知模组协议'),
    title: `${latest?.channel || '模组'}${latest?.packetType ? ` / ${latest.packetType}` : ''}`,
    description: String(latest?.text || '检测到二进制界面信号，但没有可读文字。').slice(0, 1800),
    notice: '已保留原始信号和选点；未识别控件动作前不会伪造点击成功。',
    sourceAt: Number(latest?.at) || 0,
    width: 720,
    height: 420,
    sections: [],
    elements: [],
    rawSignals
  };
}

function normalizeRawSignals(input) {
  return (Array.isArray(input) ? input : []).slice(-6).map((signal) => {
    const text = String(signal?.text || signal?.raw || '');
    return {
      channel: String(signal?.channel || ''),
      packetType: String(signal?.packetType || ''),
      text: text.slice(0, MAX_VISUAL_SIGNAL_TEXT_LENGTH),
      size: Number(signal?.size) || 0,
      encoding: String(signal?.encoding || (text ? 'utf8' : 'binary')),
      truncated: Boolean(signal?.truncated || text.length > MAX_VISUAL_SIGNAL_TEXT_LENGTH),
      at: Number(signal?.at) || 0
    };
  });
}

function inferWindowColumns(type, menuCount) {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('hopper')) return 5;
  if (normalized.includes('dispenser') || normalized.includes('dropper')) return 3;
  if (normalized.includes('furnace') || normalized.includes('brewing')) return 3;
  if (menuCount > 0 && menuCount <= 5) return menuCount;
  if (menuCount > 5 && menuCount <= 9) return Math.min(9, menuCount);
  return 9;
}

function latestChatButton(buttons) {
  return (Array.isArray(buttons) ? buttons : []).at(-1) || null;
}

function createVisualId(visual) {
  const fingerprint = {
    kind: visual.kind,
    title: visual.title,
    sourceAt: visual.sourceAt,
    width: visual.width,
    height: visual.height,
    elements: (visual.elements || []).map((element) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      label: element.label,
      action: element.action
    }))
  };
  return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 20);
}

function pointInside(point, element) {
  return point.x >= element.x
    && point.y >= element.y
    && point.x <= element.x + element.width
    && point.y <= element.y + element.height;
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 10000) / 10000;
}
