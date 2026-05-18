const executors = new Map();

export function registerExecutor(target, fn) {
  executors.set(target, fn);
}

export function getExecutor(target) {
  return executors.get(target);
}

export async function executeJob(target) {
  const executor = executors.get(target);
  if (!executor) throw new Error(`No executor registered for: ${target}`);
  return executor();
}

export function listTargets() {
  return Array.from(executors.keys());
}
