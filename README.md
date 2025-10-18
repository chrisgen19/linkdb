# LinkDB - URL Bookmark Manager

A Next.js application to save and organize your favorite links with automatic metadata extraction (title and featured image).

## Features

- Paste any URL to save it to your database
- Automatically extracts page title and featured image
- Clean, responsive UI with dark mode support
- View all saved links in a card grid
- Delete unwanted links
- SQLite database for simple local storage

## Tech Stack

- **Next.js 15** with App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS** for styling
- **Prisma ORM** with SQLite
- **Cheerio** for HTML parsing and metadata extraction

## Setup Instructions

### 1. Install Dependencies

First, make sure you have enough disk space, then run:

```bash
npm install
```

### 2. Initialize the Database

Generate Prisma client and create the database:

```bash
npx prisma generate
npx prisma db push
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Paste a URL into the input field
2. Click "Save Link" - the app will automatically fetch the page title and featured image
3. View your saved links in the grid below
4. Click "Delete" to remove any link
5. Click on the URL to open it in a new tab

## Project Structure

```
linkdb/
├── app/
│   ├── api/
│   │   ├── metadata/     # Endpoint to fetch URL metadata
│   │   └── links/        # CRUD endpoints for links
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page
├── lib/
│   └── prisma.ts         # Prisma client instance
├── prisma/
│   └── schema.prisma     # Database schema
└── package.json
```

## API Endpoints

### POST /api/metadata
Fetches metadata (title, image) for a given URL.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "image": "https://example.com/og-image.jpg"
}
```

### GET /api/links
Returns all saved links.

### POST /api/links
Saves a new link to the database.

**Request:**
```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "image": "https://example.com/og-image.jpg"
}
```

### DELETE /api/links?id={id}
Deletes a link by ID.

## Database Schema

```prisma
model Link {
  id          String   @id @default(cuid())
  url         String   @unique
  title       String?
  image       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Environment Variables

Create a `.env` file (already created):

```
DATABASE_URL="file:./dev.db"
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Notes

- The app uses SQLite for simplicity, but you can switch to PostgreSQL or MySQL by updating the Prisma schema
- Images from external URLs are displayed using Next.js Image component with `unoptimized` flag
- The metadata extraction looks for OpenGraph and Twitter Card meta tags first, then falls back to standard HTML tags
