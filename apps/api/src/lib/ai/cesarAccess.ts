// Keep authorization and metering ahead of every paid Cesar invocation.
export async function withCesarAccess<T>(
  context: { user: unknown; clientId: string | null; canUseCesar: boolean },
  checkQuota: (clientId: string) => Promise<{ allowed: boolean }>,
  invoke: () => Promise<T>
): Promise<T | { fail: 'entitlement' | 'quota' }> {
  if (!context.user || !context.clientId || !context.canUseCesar) {
    return { fail: 'entitlement' };
  }
  const quota = await checkQuota(context.clientId);
  if (!quota.allowed) return { fail: 'quota' };
  return invoke();
}
