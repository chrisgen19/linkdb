import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkDB - Save Your Links",
  description: "Save and organize your favorite links",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
