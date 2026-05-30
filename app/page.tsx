'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AutoSizer,
  Grid,
  type GridCellRenderer,
} from 'react-virtualized';
import 'react-virtualized/styles.css';
import { Plus, SearchX, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import type { Actress, ActressSummary, FilterType, Link } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppHeader } from '@/components/app-header';
import { BottomBar } from '@/components/bottom-bar';
import { LinkCard } from '@/components/link-card';
import { ActressCard } from '@/components/actress-card';
import { AddLinkSheet } from '@/components/add-link-sheet';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [links, setLinks] = useState<Link[]>([]);
  const [actresses, setActresses] = useState<Actress[]>([]);
  const [fetching, setFetching] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);

  const gridRef = useRef<Grid>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    (async () => {
      try {
        const [linksRes, actressRes] = await Promise.all([
          fetch('/api/links'),
          fetch('/api/actresses'),
        ]);
        if (linksRes.ok) setLinks(await linksRes.json());
        if (actressRes.ok) setActresses(await actressRes.json());
      } catch (err) {
        console.error('Failed to load data:', err);
        toast.error('Could not load your links');
      } finally {
        setFetching(false);
      }
    })();
  }, [status]);

  const filteredLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = links.filter((link) => {
      if (filter === 'favorites' && !link.favorite) return false;
      if (!q) return true;
      return (
        link.title?.toLowerCase().includes(q) ||
        link.url.toLowerCase().includes(q) ||
        link.actress?.name.toLowerCase().includes(q)
      );
    });
    if (filter === 'most-viewed') {
      result = [...result].sort((a, b) => b.clickCount - a.clickCount);
    }
    return result;
  }, [links, query, filter]);

  // Derive one card per actress from the loaded links. `links` arrives sorted
  // newest-first, so the first image we encounter for an actress is their most
  // recent one; older links backfill it only if that latest link had no image.
  const actressSummaries = useMemo<ActressSummary[]>(() => {
    const map = new Map<string, ActressSummary>();
    for (const link of links) {
      if (!link.actress) continue;
      const existing = map.get(link.actress.id);
      if (existing) {
        existing.count++;
        if (link.image && !existing.images.includes(link.image)) {
          existing.images.push(link.image);
        }
      } else {
        map.set(link.actress.id, {
          id: link.actress.id,
          name: link.actress.name,
          images: link.image ? [link.image] : [],
          count: 1,
        });
      }
    }
    const q = query.trim().toLowerCase();
    return Array.from(map.values())
      // Cap the crossfade set so multi-link actresses don't load dozens of images.
      .map((a) => ({ ...a, images: a.images.slice(0, 5) }))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [links, query]);

  const isActressView = filter === 'actresses';

  function openAddSheet() {
    setEditingLink(null);
    setSheetOpen(true);
  }

  function handleEdit(link: Link) {
    setEditingLink(link);
    setSheetOpen(true);
  }

  function handleSaved(link: Link, mode: 'create' | 'update') {
    setLinks((prev) =>
      mode === 'create'
        ? [link, ...prev]
        : prev.map((l) => (l.id === link.id ? link : l))
    );
  }

  function handleActressCreated(actress: Actress) {
    setActresses((prev) =>
      prev.some((a) => a.id === actress.id) ? prev : [...prev, actress]
    );
  }

  async function handleOpen(link: Link) {
    window.open(link.url, '_blank', 'noopener,noreferrer');
    try {
      const res = await fetch(`/api/links/${link.id}/click`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
      }
    } catch {
      // Click tracking is best-effort.
    }
  }

  async function handleToggleFavorite(link: Link) {
    // Optimistic update.
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, favorite: !l.favorite } : l))
    );
    try {
      const res = await fetch('/api/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: link.id, favorite: !link.favorite }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
    } catch {
      // Revert on failure.
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, favorite: link.favorite } : l))
      );
      toast.error('Could not update favorite');
    }
  }

  async function handleDelete(link: Link) {
    const snapshot = links;
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    try {
      const res = await fetch(`/api/links?id=${link.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Link deleted');
    } catch {
      setLinks(snapshot);
      toast.error('Could not delete link');
    }
  }

  function handleActressClick(name: string) {
    setFilter('all');
    setQuery(name);
    gridRef.current?.scrollToPosition({ scrollLeft: 0, scrollTop: 0 });
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="grid h-[100dvh] place-items-center bg-ambient">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="size-4 animate-pulse text-primary" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background bg-ambient">
      <AppHeader
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        onAdd={openAddSheet}
        userEmail={session?.user?.email}
      />

      <main className="min-h-0 flex-1">
        <div className="mx-auto h-full max-w-7xl px-2 pb-24 pt-3 md:px-5 md:pb-4">
          {fetching ? (
            <LoadingGrid />
          ) : isActressView ? (
            actressSummaries.length === 0 ? (
              <EmptyState
                hasLinks={links.length > 0}
                query={query}
                filter={filter}
                onAdd={openAddSheet}
              />
            ) : (
              <div className="h-full overflow-y-auto scrollbar-thin pb-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {actressSummaries.map((actress) => (
                    <ActressCard
                      key={actress.id}
                      actress={actress}
                      onClick={handleActressClick}
                    />
                  ))}
                </div>
              </div>
            )
          ) : filteredLinks.length === 0 ? (
            <EmptyState
              hasLinks={links.length > 0}
              query={query}
              filter={filter}
              onAdd={openAddSheet}
            />
          ) : (
            <AutoSizer>
              {({ height, width }) => {
                const columnCount =
                  width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1;
                const columnWidth = width / columnCount;
                const innerWidth = columnWidth - 16;
                const rowHeight = Math.round(innerWidth * 0.625) + 168;
                const rowCount = Math.ceil(filteredLinks.length / columnCount);

                const cellRenderer: GridCellRenderer = ({
                  columnIndex,
                  rowIndex,
                  key,
                  style,
                }) => {
                  const index = rowIndex * columnCount + columnIndex;
                  if (index >= filteredLinks.length) return null;
                  const link = filteredLinks[index];
                  return (
                    <div key={key} style={style} className="p-2">
                      <LinkCard
                        link={link}
                        onOpen={handleOpen}
                        onToggleFavorite={handleToggleFavorite}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onActressClick={handleActressClick}
                      />
                    </div>
                  );
                };

                return (
                  <Grid
                    ref={gridRef}
                    className="scrollbar-thin focus:outline-none"
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
          )}
        </div>
      </main>

      <BottomBar
        filter={filter}
        onFilterChange={setFilter}
        onAdd={openAddSheet}
      />

      <AddLinkSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingLink={editingLink}
        actresses={actresses}
        onSaved={handleSaved}
        onActressCreated={handleActressCreated}
      />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasLinks,
  query,
  filter,
  onAdd,
}: {
  hasLinks: boolean;
  query: string;
  filter: FilterType;
  onAdd: () => void;
}) {
  const isActresses = filter === 'actresses';
  const isSearch = hasLinks && (!!query || filter !== 'all');

  const heading = isActresses
    ? 'No actresses'
    : isSearch
      ? 'Nothing here'
      : 'Start your library';
  const body = isActresses
    ? query
      ? 'No actresses match your search.'
      : 'Tag links with an actress and they’ll show up here.'
    : isSearch
      ? 'No links match your search or filter. Try clearing it.'
      : 'Save your first link — paste a URL and we’ll grab the title and cover automatically.';

  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-sm animate-fade-up">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-secondary">
          {isSearch || isActresses ? (
            <SearchX className="size-7 text-muted-foreground" />
          ) : (
            <Sparkles className="size-7 text-primary" />
          )}
        </div>
        <h2 className="font-display text-2xl">{heading}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        {!isSearch && !isActresses && (
          <Button onClick={onAdd} size="lg" className="mt-6 rounded-full">
            <Plus /> Add your first link
          </Button>
        )}
      </div>
    </div>
  );
}
