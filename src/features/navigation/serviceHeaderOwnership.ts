/** Screen descriptors are evaluated before usePathname catches up during a push. */
export function serviceOwnsHeader(routeName: string): boolean {
  return /^(?:help|stock_balances)(?:\/.*)?$/.test(routeName);
}
