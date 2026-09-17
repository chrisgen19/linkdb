import { prisma } from '@/lib/prisma';
import { duplicateUrlCandidates } from '@/lib/url';

/**
 * Finds a link the user already saved under any equivalent spelling of the URL.
 * `raw` is the URL as received and `href` its normalized form.
 */
export function findDuplicateLink(userId: string, raw: string, href: string) {
  return prisma.link.findFirst({
    where: { userId, url: { in: duplicateUrlCandidates(raw, href) } },
    include: { actresses: true },
  });
}
