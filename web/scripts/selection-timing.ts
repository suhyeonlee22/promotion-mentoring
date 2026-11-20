const metrics: Record<string, { ms: number; calls: number }> = {};
export function mark(name: string, start: number) {
  const elapsed = performance.now() - start;
  const metric = metrics[name] ??= { ms: 0, calls: 0 };
  metric.ms += elapsed;
  metric.calls++;
}
export { metrics };
