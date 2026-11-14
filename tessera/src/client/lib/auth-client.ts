import { createAuthClient } from 'better-auth/client';

/** Thin client for the auth endpoints mounted at /api/auth. */
export const authClient = createAuthClient({ baseURL: window.location.origin });
