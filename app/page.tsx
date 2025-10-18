'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Link {
  id: string;
  url: string;
  title: string | null;
  image: string | null;
  createdAt: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingLinks, setFetchingLinks] = useState(true);

  // Fetch all links on mount
  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const response = await fetch('/api/links');
      if (response.ok) {
        const data = await response.json();
        setLinks(data);
      }
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setFetchingLinks(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First, fetch metadata
      const metadataResponse = await fetch('/api/metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!metadataResponse.ok) {
        const errorData = await metadataResponse.json();
        throw new Error(errorData.error || 'Failed to fetch metadata');
      }

      const metadata = await metadataResponse.json();

      // Then, save to database
      const saveResponse = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || 'Failed to save link');
      }

      const newLink = await saveResponse.json();
      setLinks([newLink, ...links]);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/links?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setLinks(links.filter((link) => link.id !== id));
      }
    } catch (err) {
      console.error('Error deleting link:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            LinkDB
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Save and organize your favorite links
          </p>
        </div>

        {/* Add Link Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL here..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Save Link'}
            </button>
          </form>
          {error && (
            <p className="mt-4 text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Links Grid */}
        {fetchingLinks ? (
          <div className="text-center text-gray-600 dark:text-gray-400">
            Loading links...
          </div>
        ) : links.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-400">
            No links saved yet. Add your first link above!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {links.map((link) => (
              <div
                key={link.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
              >
                {link.image && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative h-48 bg-gray-200 dark:bg-gray-700 block"
                  >
                    <Image
                      src={link.image}
                      alt={link.title || 'Link preview'}
                      fill
                      className="object-cover hover:opacity-90 transition-opacity"
                      unoptimized
                    />
                  </a>
                )}
                <div className="p-4">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-2"
                  >
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {link.title || 'Untitled'}
                    </h3>
                  </a>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm block mb-4 truncate"
                  >
                    {link.url}
                  </a>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(link.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDelete(link.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
