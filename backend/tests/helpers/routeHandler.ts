/**
 * Pulls the final handler for a route off an Express router, so routes whose
 * handlers are defined inline can be called with a mock req/res.
 */
export function routeHandler(
  router: any,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string
): (req: any, res: any, next?: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route registered`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}
