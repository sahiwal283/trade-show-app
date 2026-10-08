import type { Mock } from 'vitest';

/**
 * Answers a mocked `query` by the `devdash:<name>` tag at the start of each
 * SQL statement, so tests do not depend on the order queries run in.
 * A route whose answer is an Error makes that query reject.
 */
export function routeQueries(mock: Mock, routes: Array<[string, any[] | Error]>): void {
  mock.mockImplementation(async (sql: string) => {
    const tag = /devdash:([a-z0-9-]+)/.exec(sql)?.[1];
    const hit = routes.find(([name]) => name === tag);
    if (!hit) throw new Error(`No mocked rows for query tagged "${tag}"`);
    if (hit[1] instanceof Error) throw hit[1];
    return { rows: hit[1], rowCount: hit[1].length };
  });
}
