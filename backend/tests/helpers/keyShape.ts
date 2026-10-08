/**
 * Reduces a value to its key structure so a service's output can be compared
 * with a contract fixture: objects keep their (sorted) keys, arrays keep the
 * shape of their first element, every leaf becomes '*'. Values and nullness
 * are ignored on purpose; only names and nesting are the contract.
 */
export function keyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [keyShape(value[0])] : [];
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as object).sort().map((key) => [key, keyShape((value as Record<string, unknown>)[key])])
    );
  }
  return '*';
}
