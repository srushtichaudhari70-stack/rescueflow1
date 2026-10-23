// Generates unique, readable IDs using counters stored inside the app state.
// Because the counters are saved in LocalStorage together with the data,
// an ID is never reused, even after a page refresh.

export function nextId(state, key, prefix) {
  const current = state.counters[key] ?? 1000;
  state.counters[key] = current + 1;
  return `${prefix}-${current + 1}`;
}
