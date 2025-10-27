'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Grid, AutoSizer } from 'react-virtualized';
import 'react-virtualized/styles.css';

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
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'links' | 'actress' | 'favorites'>('links');
  const [showSearchActressDropdown, setShowSearchActressDropdown] = useState(false);

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

  // Filter actresses for search dropdown
  const searchFilteredActresses = actresses.filter((actress) =>
    actress.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter links based on search
  const filteredLinks = links.filter((link) => {
    // Handle favorites filter
    if (searchType === 'favorites') {
      return link.favorite;
    }

    // If no search query, show all
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();

    if (searchType === 'links') {
      // Search by title or URL
      const titleMatch = link.title?.toLowerCase().includes(query);
      const urlMatch = link.url.toLowerCase().includes(query);
      return titleMatch || urlMatch;
    } else if (searchType === 'actress') {
      // Search by actress name
      return link.actress?.name.toLowerCase().includes(query);
    }

    return true;
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

      if (editingLink) {
        // Update existing link
        const updateResponse = await fetch('/api/links', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingLink.id,
            favorite,
            actressId,
          }),
        });

        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          throw new Error(errorData.error || 'Failed to update link');
        }

        const updatedLink = await updateResponse.json();
        setLinks(links.map((link) => (link.id === updatedLink.id ? updatedLink : link)));
      } else {
        // Create new link
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
      }

      setUrl('');
      setFavorite(false);
      setActressInput('');
      setSelectedActress(null);
      setEditingLink(null);
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

  const handleEdit = (link: Link) => {
    setEditingLink(link);
    setUrl(link.url);
    setFavorite(link.favorite);
    if (link.actress) {
      setActressInput(link.actress.name);
      setSelectedActress(link.actress);
    } else {
      setActressInput('');
      setSelectedActress(null);
    }
    setShowModal(true);
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
              onChange={(e) => {
                const newType = e.target.value as 'links' | 'actress' | 'favorites';
                setSearchType(newType);
                if (newType === 'favorites') {
                  setSearchQuery('');
                }
              }}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="links">Search Links</option>
              <option value="actress">Search Actress</option>
              <option value="favorites">Favorites</option>
            </select>

            {/* Search Input with Actress Dropdown */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (searchType === 'actress') {
                    setShowSearchActressDropdown(true);
                  }
                }}
                onFocus={() => {
                  if (searchType === 'actress') {
                    setShowSearchActressDropdown(true);
                  }
                }}
                onBlur={() => setTimeout(() => setShowSearchActressDropdown(false), 200)}
                placeholder={
                  searchType === 'favorites'
                    ? 'Showing favorite links...'
                    : searchType === 'links'
                    ? 'Search by title or URL...'
                    : 'Search by actress name...'
                }
                disabled={searchType === 'favorites'}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />

              {/* Actress Dropdown for Search */}
              {searchType === 'actress' && showSearchActressDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchFilteredActresses.length > 0 ? (
                    searchFilteredActresses.map((actress) => (
                      <button
                        key={actress.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery(actress.name);
                          setShowSearchActressDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                      >
                        {actress.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm">
                      No actresses found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear Search Button */}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchActressDropdown(false);
                }}
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
                  {editingLink ? 'Edit Link' : 'Add New Link'}
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setError('');
                    setUrl('');
                    setFavorite(false);
                    setActressInput('');
                    setSelectedActress(null);
                    setEditingLink(null);
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
                      disabled={loading || !!editingLink}
                      readOnly={!!editingLink}
                    />
                    {editingLink && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        URL cannot be changed when editing
                      </p>
                    )}
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
                        setEditingLink(null);
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
                      {loading ? (editingLink ? 'Updating...' : 'Saving...') : (editingLink ? 'Update Link' : 'Save Link')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Search Results Count */}
        {!fetchingLinks && links.length > 0 && (
          <>
            {searchType === 'favorites' ? (
              <div className="mb-4 text-gray-600 dark:text-gray-400">
                Showing {filteredLinks.length} favorite {filteredLinks.length === 1 ? 'link' : 'links'}
              </div>
            ) : searchQuery ? (
              <div className="mb-4 text-gray-600 dark:text-gray-400">
                Found {filteredLinks.length} {filteredLinks.length === 1 ? 'result' : 'results'} for "{searchQuery}"
              </div>
            ) : null}
          </>
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
            {searchType === 'favorites'
              ? 'No favorite links yet. Click the star icon on a link to add it to favorites!'
              : `No links found matching "${searchQuery}"`}
          </div>
        ) : (
          <div style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
            <AutoSizer>
              {({ height, width }) => {
                // Calculate columns based on width
                const getColumnCount = () => {
                  if (width >= 1024) return 3; // lg
                  if (width >= 768) return 2;  // md
                  return 1;                     // mobile
                };

                const columnCount = getColumnCount();
                const columnWidth = width / columnCount;
                const rowHeight = 420; // Fixed height for each card
                const rowCount = Math.ceil(filteredLinks.length / columnCount);

                const cellRenderer = ({ columnIndex, rowIndex, key, style }: any) => {
                  const index = rowIndex * columnCount + columnIndex;
                  if (index >= filteredLinks.length) return null;

                  const link = filteredLinks[index];

                  return (
                    <div key={key} style={{
                      ...style,
                      padding: '12px',
                    }}>
                      <div
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow h-full"
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
                              <button
                                onClick={() => {
                                  setSearchType('actress');
                                  setSearchQuery(link.actress!.name);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-sm rounded-full hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors cursor-pointer"
                              >
                                {link.actress.name}
                              </button>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(link.createdAt).toLocaleDateString()}
                            </span>
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleEdit(link)}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(link.id)}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <Grid
                    cellRenderer={cellRenderer}
                    columnCount={columnCount}
                    columnWidth={columnWidth}
                    height={height}
                    rowCount={rowCount}
                    rowHeight={rowHeight}
                    width={width}
                    overscanRowCount={2}
                  />
                );
              }}
            </AutoSizer>
          </div>
        )}
      </div>
    </div>
  );
}
