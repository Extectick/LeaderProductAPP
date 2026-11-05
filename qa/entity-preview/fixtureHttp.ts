/** Any unexpected application HTTP call fails locally. Metro/HMR transports are untouched. */
export async function httpRequest(..._args: unknown[]): Promise<never> {
  throw new Error('ENTITY_QA_NETWORK_DISABLED');
}
