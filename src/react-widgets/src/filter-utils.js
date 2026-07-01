export function normalizeFiltersConfig(gridConfig) {
  if (gridConfig.filters) return gridConfig.filters;
  if (gridConfig.querySwitcher) {
    const qs = gridConfig.querySwitcher;
    return [{
      id: '__legacy__',
      label: qs.label,
      type: 'single',
      defaultIndex: qs.defaultIndex ?? 0,
      options: qs.options,
    }];
  }
  return [];
}

export function buildInitialFilterState(filters) {
  const state = {};
  for (const f of filters) {
    if (f.type === 'multi') {
      const defaults = f.defaultIndices ?? [];
      state[f.id] = new Set(defaults);
    } else {
      state[f.id] = f.defaultIndex ?? 0;
    }
  }
  return state;
}

function mergeMultiGroupVariables(filter, selectedSet) {
  if (selectedSet.size === 0) return {};
  const merged = {};
  for (const idx of selectedSet) {
    const vars = filter.options[idx]?.variables ?? {};
    for (const [key, val] of Object.entries(vars)) {
      if (!merged[key]) {
        merged[key] = [...val];
      } else {
        for (const v of val) {
          if (!merged[key].includes(v)) merged[key].push(v);
        }
      }
    }
  }
  return merged;
}

export function mergeFilterVariables(filters, filterState) {
  const combined = {};
  for (const f of filters) {
    const groupVars = f.type === 'multi'
      ? mergeMultiGroupVariables(f, filterState[f.id] ?? new Set())
      : (f.options[filterState[f.id] ?? 0]?.variables ?? {});
    Object.assign(combined, groupVars);
  }
  return combined;
}
