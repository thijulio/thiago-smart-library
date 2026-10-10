export interface AuthConfig {
  origin: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
  databaseUrl: string;
}
export function readRuntimeConfig(env: Record<string, string | undefined>): AuthConfig {
  try {
    const origin = new URL(env.BETTER_AUTH_URL ?? '');
    const database = new URL(env.DATABASE_RUNTIME_URL ?? '');
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.username !== 'sl_app_runtime' ||
      !database.password ||
      !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(database.hostname) ||
      !['require', 'verify-full'].includes(database.searchParams.get('sslmode') ?? '') ||
      (env.BETTER_AUTH_SECRET?.length ?? 0) < 32 ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET
    ) {
      throw new Error();
    }
    return {
      origin: origin.origin,
      secret: env.BETTER_AUTH_SECRET!,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      databaseUrl: database.toString(),
    };
  } catch {
    throw new Error('AUTH_CONFIGURATION_UNAVAILABLE');
  }
}
export function permitsUser(user: { emailVerified: boolean }) {
  return user.emailVerified === true;
}
