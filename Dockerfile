# Official Playwright image — ships Chromium + all required OS libraries.
# Keep this tag in sync with the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install dependencies first for better layer caching.
# `prisma` is a devDependency but is needed at runtime (start runs `prisma db
# push`), so install dev deps too. postinstall runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

# Copy the rest of the source and build.
COPY . .
RUN npm run build

# Next.js runs in production mode at runtime; DATABASE_URL / NEXTAUTH_* are
# supplied by the host (Coolify env vars), not baked into the image.
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# `npm start` => `prisma db push && next start`
CMD ["npm", "start"]
