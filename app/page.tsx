'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Link {
  id: string;
  url: string;
  title: string | null;
  image: string | null;
  favorite: boolean;
  actressId: string | null;
  actress: { id: string; name: string } | null;
  createdAt: string;
}

interface Actress {
  id: string;
  name: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [actressInput, setActressInput] = useState('');
  const [selectedActress, setSelectedActress] = useState<Actress | null>(null);
  const [actresses, setActresses] = useState<Actress[]>([]);
  const [filteredActresses, setFilteredActresses] = useState<Actress[]>([]);
  const [showActressDropdown, setShowActressDropdown] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingLinks, setFetchingLinks] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'links' | 'actress'>('links');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch all links and actresses on mount
  useEffect(() => {
    if (status === 'authenticated') {
      fetchLinks();
      fetchActresses();
    }
  }, [status]);

  // Filter actresses based on input
  useEffect(() => {
    if (actressInput.trim()) {
      const filtered = actresses.filter((actress) =>
        actress.name.toLowerCase().includes(actressInput.toLowerCase())
      );
      setFilteredActresses(filtered);
    } else {
      setFilteredActresses(actresses);
    }
  }, [actressInput, actresses]);

  // Filter links based on search
  const filteredLinks = links.filter((link) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();

    if (searchType === 'links') {
      // Search by title or URL
      const titleMatch = link.title?.toLowerCase().includes(query);
      const urlMatch = link.url.toLowerCase().includes(query);
      return titleMatch || urlMatch;
    } else {
      // Search by actress name
      return link.actress?.name.toLowerCase().includes(query);
    }
  });

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

  const fetchActresses = async () => {
    try {
      const response = await fetch('/api/actresses');
      if (response.ok) {
        const data = await response.json();
        setActresses(data);
        setFilteredActresses(data);
      }
    } catch (err) {
      console.error('Error fetching actresses:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Create or get actress ID if actress input is provided
      let actressId = selectedActress?.id || null;
      if (actressInput.trim() && !selectedActress) {
        const actressResponse = await fetch('/api/actresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: actressInput.trim() }),
        });

        if (actressResponse.ok) {
          const actress = await actressResponse.json();
          actressId = actress.id;
          // Refresh actresses list
          await fetchActresses();
        }
      }

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

      // Then, save to database with favorite and actress
      const saveResponse = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...metadata,
          favorite,
          actressId,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || 'Failed to save link');
      }

      const newLink = await saveResponse.json();
      setLinks([newLink, ...links]);
      setUrl('');
      setFavorite(false);
      setActressInput('');
      setSelectedActress(null);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      const response = await fetch('/api/links', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, favorite: !currentFavorite }),
      });

      if (response.ok) {
        const updatedLink = await response.json();
        setLinks(links.map((link) => (link.id === id ? updatedLink : link)));
      }
    } catch (err) {
      console.error('Error updating favorite:', err);
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

  const handleActressSelect = (actress: Actress) => {
    setSelectedActress(actress);
    setActressInput(actress.name);
    setShowActressDropdown(false);
  };

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400">
          Loading...
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated
  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header with add link, website name, and logout */}
        <div className="flex justify-between items-center mb-8">
          {/* Add Link Button - Left Side */}
          <div>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
            >
              + Add Link
            </button>
          </div>

          {/* Website Name - Center */}
          <div className="text-center flex-1">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
              LinkDB
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Save and organize your favorite links
            </p>
          </div>

          {/* User Info and Logout - Right Side */}
          <div className="flex items-center gap-4">
            {session?.user?.email && (
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                {session.user.email}
              </span>
            )}
            <button
              onClick={() => signOut()}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="flex gap-3">
            {/* Search Type Dropdown */}
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'links' | 'actress')}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="links">Search Links</option>
              <option value="actress">Search Actress</option>
            </select>

            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchType === 'links' ? 'Search by title or URL...' : 'Search by actress name...'}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Clear Search Button */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Add Link Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Add New Link
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setError('');
                    setUrl('');
                    setFavorite(false);
                    setActressInput('');
                    setSelectedActress(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  {/* URL Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      required
                      disabled={loading}
                    />
                  </div>

                  {/* Favorite Toggle */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={favorite}
                        onChange={(e) => setFavorite(e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                      />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">
                        Mark as Favorite
                      </span>
                    </label>
                  </div>

                  {/* Actress Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Actress (optional)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={actressInput}
                        onChange={(e) => {
                          setActressInput(e.target.value);
                          setSelectedActress(null);
                          setShowActressDropdown(true);
                        }}
                        onFocus={() => setShowActressDropdown(true)}
                        onBlur={() => setTimeout(() => setShowActressDropdown(false), 200)}
                        placeholder="Type to search or add new actress"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        disabled={loading}
                      />
                      {showActressDropdown && filteredActresses.length > 0 && actressInput && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredActresses.map((actress) => (
                            <button
                              key={actress.id}
                              type="button"
                              onClick={() => handleActressSelect(actress)}
                              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white"
                            >
                              {actress.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                      <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  {/* Modal Footer */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        setError('');
                        setUrl('');
                        setFavorite(false);
                        setActressInput('');
                        setSelectedActress(null);
                      }}
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
                    >
                      {loading ? 'Saving...' : 'Save Link'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Search Results Count */}
        {!fetchingLinks && links.length > 0 && searchQuery && (
          <div className="mb-4 text-gray-600 dark:text-gray-400">
            Found {filteredLinks.length} {filteredLinks.length === 1 ? 'result' : 'results'} for "{searchQuery}"
          </div>
        )}

        {/* Links Grid */}
        {fetchingLinks ? (
          <div className="text-center text-gray-600 dark:text-gray-400">
            Loading links...
          </div>
        ) : links.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-400">
            No links saved yet. Add your first link above!
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-400">
            No links found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLinks.map((link) => (
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
                  <div className="flex items-start justify-between mb-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-white line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {link.title || 'Untitled'}
                      </h3>
                    </a>
                    <button
                      onClick={() => handleToggleFavorite(link.id, link.favorite)}
                      className="ml-2 text-2xl hover:scale-110 transition-transform"
                      title={link.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {link.favorite ? '⭐' : '☆'}
                    </button>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm block mb-2 truncate"
                  >
                    {link.url}
                  </a>
                  {link.actress && (
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-sm rounded-full">
                        {link.actress.name}
                      </span>
                    </div>
                  )}
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
