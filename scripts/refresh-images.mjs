/**
 * Refreshes broken/outdated link thumbnails.
 *
 * For every link whose stored image no longer loads, this re-fetches the page
 * (plain fetch first, headless Chromium fallback for anti-bot pages), reads the
 * current og:image / twitter:image, verifies it returns a real image, and
 * updates the DB. Links whose image already loads are skipped.
 *
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/db" node scripts/refresh-images.mjs
 *   DATABASE_URL="..." node scripts/refresh-images.mjs --dry   # report only
 */
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";
import { chromium } from "playwright";

const DRY_RUN = process.argv.includes("--dry");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PAGE_HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeChallenge(html) {
  return /<title>\s*just a moment|checking your browser before accessing|cf-browser-verification|please enable javascript and cookies to continue/i.test(
    html
  );
}

function makeAbsolute(img, base) {
  if (!img || img.startsWith("http")) return img;
  try {
    const u = new URL(base);
    if (img.startsWith("//")) return u.protocol + img;
    if (img.startsWith("/")) return u.origin + img;
    return u.origin + "/" + img;
  } catch {
    return img;
  }
}

async function imageOk(url) {
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA, Accept: "image/avif,image/webp,*/*;q=0.8" },
      signal: AbortSignal.timeout(8000),
    });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image");
  } catch {
    return false;
  }
}

async function fetchHtmlWithBrowser(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    let html = await page.content();
    if (looksLikeChallenge(html)) {
      await page.waitForTimeout(6000);
      html = await page.content();
    }
    return html;
  } finally {
    await browser.close();
  }
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: PAGE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      if (!looksLikeChallenge(html)) return html;
    } else if (res.status === 404 || res.status === 410) {
      return null;
    }
  } catch {
    // fall through to browser
  }
  return fetchHtmlWithBrowser(url);
}

function extractImage($, base) {
  const candidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
    $('meta[itemprop="image"]').attr("content"),
  ].filter(Boolean);
  return candidates.length ? makeAbsolute(candidates[0], base) : null;
}

function extractTitle($) {
  return (
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").text().trim() ||
    ""
  ).trim();
}

async function main() {
  const links = await prisma.link.findMany({ orderBy: { createdAt: "desc" } });
  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}Checking ${links.length} links…\n`
  );

  let updated = 0;
  let kept = 0;
  let unfixable = 0;
  let i = 0;

  for (const link of links) {
    i++;
    const label = `[${i}/${links.length}] ${(link.title || link.url).slice(0, 48)}`;

    // Skip links whose current thumbnail already loads.
    if (await imageOk(link.image)) {
      kept++;
      continue;
    }

    try {
      const html = await fetchHtml(link.url);
      if (!html) {
        unfixable++;
        console.log(`✗ ${label} — page unreachable`);
        continue;
      }
      const $ = cheerio.load(html);
      const newImage = extractImage($, link.url);
      const newTitle = extractTitle($);

      if (newImage && newImage !== link.image && (await imageOk(newImage))) {
        if (!DRY_RUN) {
          await prisma.link.update({
            where: { id: link.id },
            data: {
              image: newImage,
              ...(newTitle && !link.title ? { title: newTitle } : {}),
            },
          });
        }
        updated++;
        console.log(`✓ ${label}\n    → ${newImage}`);
      } else {
        unfixable++;
        console.log(`✗ ${label} — no working image found`);
      }
    } catch (err) {
      unfixable++;
      console.log(`✗ ${label} — ${err instanceof Error ? err.message : err}`);
    }

    await sleep(200);
  }

  console.log(
    `\nDone. ${updated} updated, ${kept} already OK, ${unfixable} still broken.\n`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
