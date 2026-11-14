/**
 * Auth calls, loaded on demand: the Better Auth client is only needed on the
 * account screens, so it stays out of the bundle every page starts with.
 */
const load = () => import('./auth-client').then((m) => m.authClient);

type Client = Awaited<ReturnType<typeof load>>;

export const authClient = {
  signUp: { email: async (...args: Parameters<Client['signUp']['email']>) => (await load()).signUp.email(...args) },
  signIn: {
    email: async (...args: Parameters<Client['signIn']['email']>) => (await load()).signIn.email(...args),
    social: async (...args: Parameters<Client['signIn']['social']>) => (await load()).signIn.social(...args),
  },
  signOut: async () => (await load()).signOut(),
  requestPasswordReset: async (...args: Parameters<Client['requestPasswordReset']>) => (await load()).requestPasswordReset(...args),
  resetPassword: async (...args: Parameters<Client['resetPassword']>) => (await load()).resetPassword(...args),
  sendVerificationEmail: async (...args: Parameters<Client['sendVerificationEmail']>) => (await load()).sendVerificationEmail(...args),
  changePassword: async (...args: Parameters<Client['changePassword']>) => (await load()).changePassword(...args),
  updateUser: async (...args: Parameters<Client['updateUser']>) => (await load()).updateUser(...args),
  deleteUser: async (...args: Parameters<Client['deleteUser']>) => (await load()).deleteUser(...args),
};

export function authErrorCode(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return 'unknown';
  if (error.status === 429) return 'rate_limited';
  return (error.code ?? 'unknown').toLowerCase();
}
