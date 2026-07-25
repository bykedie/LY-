export function normalizeSpecificRuntimeTarget(target, actionLabel) {
  if (target === undefined) throw new Error(`${actionLabel}需要选择一个具体账号。`);
  if (typeof target !== 'string') throw new Error(`${actionLabel}目标必须是文本。`);
  const normalized = target.trim();
  if (!normalized || normalized === 'all') throw new Error(`${actionLabel}需要选择一个具体账号。`);
  return normalized;
}
