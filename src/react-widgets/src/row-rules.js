function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
}

function evalCondition(condition, row) {
  const { field, op, value } = condition;
  const fieldVal = getNestedValue(row, field);
  switch (op) {
    case 'exists':    return fieldVal != null;
    case 'notExists': return fieldVal == null;
    case 'eq':        return fieldVal === value;
    case 'neq':       return fieldVal !== value;
    case 'contains':  return typeof fieldVal === 'string' && fieldVal.includes(value);
    case 'in':        return Array.isArray(value) && value.includes(fieldVal);
    case 'gt':        return fieldVal > value;
    case 'lt':        return fieldVal < value;
    default:          return false;
  }
}

export function evaluateRowRules(rules, row) {
  if (!rules?.length || !row) return {};
  for (const rule of rules) {
    if (evalCondition(rule.when, row)) {
      const style = {};
      if (rule.background) style.background = rule.background;
      if (rule.color) style.color = rule.color;
      return style;
    }
  }
  return {};
}
