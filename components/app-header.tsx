"use client";

import { LogOut, Plus, Search, X } from "lucide-react";
import { signOut } from "next-auth/react";

import { cn } from "@/lib/utils";
import type { FilterType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "favorites", label: "Favorites" },
  { value: "most-viewed", label: "Most viewed" },
  { value: "actresses", label: "Actresses" },
];

interface AppHeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
  filter: FilterType;
  onFilterChange: (value: FilterType) => void;
  onAdd: () => void;
  userEmail?: string | null;
}

export function AppHeader({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  onAdd,
  userEmail,
}: AppHeaderProps) {
  const initial = (userEmail?.[0] ?? "U").toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
        {/* Wordmark */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-display text-xl leading-none">L</span>
          </span>
          <span className="hidden font-display text-2xl leading-none tracking-tight sm:inline">
            LinkDB
          </span>
        </div>

        {/* Search — grows to fill */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search links, tags…"
            inputMode="search"
            enterKeyHint="search"
            className="h-11 rounded-full pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Desktop-only filters + add */}
        <div className="hidden items-center gap-1 rounded-full bg-secondary p-1 md:flex">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onFilterChange(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Button onClick={onAdd} className="hidden rounded-full md:inline-flex">
          <Plus /> Add link
        </Button>

        <ThemeToggle className="rounded-full" />

        {/* Account */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
          >
            {initial}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {userEmail && (
              <>
                <DropdownMenuLabel className="truncate normal-case">
                  {userEmail}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={() => signOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
