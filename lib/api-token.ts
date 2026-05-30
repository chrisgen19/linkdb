import crypto from 'crypto';
import { prisma } from './prisma';

/** Generates a new opaque personal token, prefixed for easy identification. */
export function generateApiToken(): string {
  return 'lkdb_' + crypto.randomBytes(32).toString('base64url');
}

/** Returns the user's token, creating one on first request. */
export async function getOrCreateApiToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiToken: true },
  });
  if (user?.apiToken) return user.apiToken;

  // Only set the token if it's still null, so two concurrent first-time
  // requests can't overwrite each other (the loser would return a dead token).
  await prisma.user.updateMany({
    where: { id: userId, apiToken: null },
    data: { apiToken: generateApiToken() },
  });

  // Return whatever actually got stored (ours, or a concurrent writer's).
  const fresh = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiToken: true },
  });
  if (!fresh?.apiToken) throw new Error('Failed to create API token');
  return fresh.apiToken;
}

/** Rotates the user's token (old one stops working immediately). */
export async function regenerateApiToken(userId: string): Promise<string> {
  const token = generateApiToken();
  await prisma.user.update({ where: { id: userId }, data: { apiToken: token } });
  return token;
}

/** Resolves a bearer token to a user id, or null if it doesn't match anyone. */
export async function userIdFromApiToken(token: string): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const user = await prisma.user.findFirst({
    where: { apiToken: trimmed },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Extracts the token from an `Authorization: Bearer …` or `x-api-token` header. */
export function tokenFromRequest(request: Request): string {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('x-api-token') || '').trim();
}
