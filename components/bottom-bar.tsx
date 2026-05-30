"use client";

import { ArrowUp, LayoutGrid, Plus, Star, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilterType } from "@/lib/types";

interface BottomBarProps {
  filter: FilterType;
  onFilterChange: (value: FilterType) => void;
  onAdd: () => void;
  onScrollTop: () => void;
}

const TABS: { value: FilterType; label: string; icon: typeof LayoutGrid }[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "favorites", label: "Faves", icon: Star },
];

const RIGHT_TABS: { value: FilterType; label: string; icon: typeof LayoutGrid }[] =
  [{ value: "most-viewed", label: "Top", icon: TrendingUp }];

export function BottomBar({
  filter,
  onFilterChange,
  onAdd,
  onScrollTop,
}: BottomBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-xl pb-safe md:hidden">
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-center px-2">
        {TABS.map((t) => (
          <TabButton
            key={t.value}
            active={filter === t.value}
            label={t.label}
            icon={t.icon}
            onClick={() => onFilterChange(t.value)}
          />
        ))}

        {/* Center FAB */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add link"
            className="grid size-14 -translate-y-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
        </div>

        {RIGHT_TABS.map((t) => (
          <TabButton
            key={t.value}
            active={filter === t.value}
            label={t.label}
            icon={t.icon}
            onClick={() => onFilterChange(t.value)}
          />
        ))}

        <TabButton
          active={false}
          label="Up"
          icon={ArrowUp}
          onClick={onScrollTop}
        />
      </div>
    </nav>
  );
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof LayoutGrid;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className={cn("size-[22px]", active && "fill-primary/15")} />
      {label}
    </button>
  );
}
