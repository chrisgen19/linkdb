# LinkDB - Advanced URL Bookmark Manager

A powerful Next.js application to save, organize, and manage your favorite links with automatic metadata extraction, user authentication, and advanced search capabilities.

## ✨ Features

### Core Features
- 🔐 **User Authentication** - Secure login/register with NextAuth.js
- 📝 **Smart Metadata Extraction** - Automatically extracts titles and images from URLs
- 🖼️ **Advanced Image Detection** - Searches meta tags, CSS, HTML content, and more
- ⭐ **Favorites** - Mark important links as favorites
- 🏷️ **Actress Tags** - Organize links with custom actress tags
- 👁️ **Click Tracking** - Tracks how many times you've clicked each link
- 🔍 **Multi-Mode Search**:
  - Search by title or URL
  - Search by actress name (with autocomplete)
  - Filter favorites
  - Sort by most viewed
- 📱 **Responsive Design** - Mobile-friendly with hide-on-scroll header
- 🌙 **Dark Mode** - Full dark theme support
- ⚡ **Virtual Scrolling** - Smooth performance with large link collections

### Advanced Features
- **Intelligent Image Extraction** - Searches 8+ meta tag sources, CSS backgrounds, img tags, and raw HTML content
- **Title Extraction** - Pulls from og:title, twitter:title, schema.org, and more
- **Edit Links** - Update favorites and actress tags
- **Autocomplete** - Actress search with real-time filtering
- **Click Counter** - Automatically increments on each link visit
- **Comprehensive Error Logging** - Detailed Vercel logs for debugging metadata extraction

## 🛠️ Tech Stack

- **Next.js 15.5.6** with App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS** for styling
- **Prisma ORM** with PostgreSQL
- **NextAuth.js** for authentication
- **Cheerio** for HTML parsing and metadata extraction
- **React Virtualized** for efficient list rendering
- **Lucide React** for modern icons
- **bcryptjs** for password hashing

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud like Neon)
- Git

## 🚀 Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd linkdb
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/linkdb"

# NextAuth
NEXTAUTH_SECRET="your-super-secret-key-change-this-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

**Generate a secure NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

### 4. Set Up the Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (creates tables)
npx prisma db push
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Create Your Account

1. Navigate to `/register`
2. Create a user account
3. Log in and start adding links!

## 📖 Usage Guide

### Adding Links
1. Paste a URL into the input field
2. Optionally mark as favorite (⭐)
3. Optionally add an actress tag (autocomplete available)
4. Click "Save Link" - metadata is automatically fetched

### Searching & Filtering
- **Search Links** - Type to search by title or URL
- **Search Actress** - Click field to see all actresses, type to filter
- **Favorites** - View only favorited links
- **Most Viewed** - Sort by click count (most to least)

### Managing Links
- **Click any link** - Opens in new tab and increments view count
- **Edit** - Update favorite status or actress tag
- **Delete** - Remove unwanted links
- **View Count** - See eye icon (👁️) with click count

## 📁 Project Structure

```
linkdb/
├── app/
│   ├── api/
│   │   ├── actresses/          # Actress CRUD endpoints
│   │   ├── auth/
│   │   │   └── [...nextauth]/  # NextAuth endpoints
│   │   ├── links/
│   │   │   ├── route.ts        # Link CRUD
│   │   │   └── [id]/
│   │   │       └── click/      # Click counter
│   │   ├── metadata/           # URL metadata extraction
│   │   └── register/           # User registration
│   ├── login/                  # Login page
│   ├── register/               # Registration page
│   ├── globals.css             # Global styles + grid-container
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main app (protected route)
├── lib/
│   ├── auth.ts                 # NextAuth configuration
│   └── prisma.ts               # Prisma client singleton
├── prisma/
│   └── schema.prisma           # Database schema
├── public/
└── package.json
```

## 🗄️ Database Schema

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  links     Link[]
  accounts  Account[]
  sessions  Session[]
}

model Link {
  id          String   @id @default(cuid())
  url         String
  title       String?
  image       String?
  favorite    Boolean  @default(false)
  clickCount  Int      @default(0)
  actressId   String?
  actress     Actress? @relation(fields: [actressId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}

model Actress {
  id        String   @id @default(cuid())
  name      String   @unique
  links     Link[]
  createdAt DateTime @default(now())
}

model Account { ... }  # NextAuth
model Session { ... }  # NextAuth
model VerificationToken { ... }  # NextAuth
```

## 🔌 API Endpoints

### Authentication

- **POST** `/api/register` - Create new user account
- **POST** `/api/auth/signin` - NextAuth login
- **POST** `/api/auth/signout` - NextAuth logout

### Links

- **GET** `/api/links` - Get all user's links
- **POST** `/api/links` - Create new link
- **PATCH** `/api/links` - Update link (favorite/actress)
- **DELETE** `/api/links?id={id}` - Delete link
- **POST** `/api/links/[id]/click` - Increment click counter

### Actresses

- **GET** `/api/actresses` - Get all actresses
- **POST** `/api/actresses` - Create actress (auto-created via links)

### Metadata

- **POST** `/api/metadata` - Extract title & image from URL

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

## 🎨 Image Extraction

The metadata API uses a sophisticated fallback system to find images:

1. **Meta Tags** (8 sources):
   - og:image, og:image:secure_url
   - twitter:image, twitter:image:src
   - link[rel="image_src"]
   - thumbnailUrl (property/name/itemprop)
   - itemprop="image"
   - msapplication-TileImage

2. **Accessibility Check** - Validates image URL returns 200

3. **CSS Background Images** - Searches inline styles

4. **First `<img>` Tag** - Gets src from first image element

5. **HTML Content Search** - Regex search for .jpg, .png, .gif, .webp URLs

6. **Smart Filtering** - Excludes icons, logos, 1x1 pixels, etc.

## 🔍 Title Extraction

Searches multiple sources in priority order:

1. og:title (Open Graph)
2. twitter:title (Twitter Card)
3. itemprop="name" (Schema.org)
4. meta[name="title"]
5. meta[name="DC.title"] (Dublin Core)
6. `<title>` tag
7. First `<h1>` heading

## 🚢 Deployment (Vercel)

### 1. Set Up Database (Neon/Postgres)

1. Create a PostgreSQL database (e.g., on [Neon](https://neon.tech))
2. Get your connection string

### 2. Configure Environment Variables in Vercel

Add these in Vercel Dashboard → Settings → Environment Variables:

- `DATABASE_URL` - Your Neon/Postgres connection string
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - Your Vercel deployment URL

### 3. Deploy

```bash
git push
```

Vercel automatically:
- Runs `prisma generate` (via postinstall)
- Runs `prisma db push` (via vercel-build)
- Builds and deploys your app

## 🐛 Debugging

### Vercel Logs

The app includes comprehensive logging for metadata extraction:

```
[Metadata] Fetching metadata for: https://example.com
[Metadata] Response received: { status: 200, contentType: 'text/html' }
[Metadata] Successfully fetched HTML (45823 characters)
[Metadata] Title extraction: { ogTitle: 'Example', ... }
[Metadata] Image extraction: { ogImage: 'https://...', ... }
[Metadata] Checking image accessibility: https://example.com/image.jpg
[Metadata] Image check response: { status: 200, ok: true }
[Metadata] Final result: { title: 'Example', hasImage: true }
```

Common errors are clearly logged:
- `❌ FETCH FAILED` - Network/DNS/SSL errors
- `❌ HTTP ERROR: 403` - Server blocked request
- `⚠️ NO IMAGES FOUND` - No images detected anywhere

## 📝 Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npx prisma studio    # Open Prisma Studio (database GUI)
npx prisma db push   # Push schema changes to database
```

## 🔒 Security Features

- ✅ Password hashing with bcryptjs
- ✅ NextAuth.js session management
- ✅ Protected API routes (user authentication required)
- ✅ User data isolation (users only see their own links)
- ✅ SQL injection prevention (Prisma ORM)
- ✅ Environment variables for secrets

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- Vercel for deployment platform
- Prisma for the excellent ORM
- All contributors and users!

---

Built with ❤️ using Next.js 15 and React 19
