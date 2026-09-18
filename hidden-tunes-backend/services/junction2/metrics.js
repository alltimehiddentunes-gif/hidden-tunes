const counters = Object.create(null);

export function recordMetric(name, fields = {}) {
  const key = String(name || "unknown");
  counters[key] = (counters[key] || 0) + 1;
  const payload = {
    event: "j2_metric",
    metric: key,
    count: counters[key],
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (/secret|token|cookie|authorization|url|password/i.test(k)) continue;
    payload[k] = v;
  }
  console.log(JSON.stringify(payload));
}

export function metricSnapshot() {
  return { ...counters };
}

export function resetMetricsForTests() {
  for (const key of Object.keys(counters)) delete counters[key];
}
