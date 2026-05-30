"use client";

import Image from "next/image";
import {
  Eye,
  Link2,
  MoreVertical,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Link } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LinkCardProps {
  link: Link;
  onOpen: (link: Link) => void;
  onToggleFavorite: (link: Link) => void;
  onEdit: (link: Link) => void;
  onDelete: (link: Link) => void;
  onActressClick: (name: string) => void;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkCard({
  link,
  onOpen,
  onToggleFavorite,
  onEdit,
  onDelete,
  onActressClick,
}: LinkCardProps) {
  const domain = domainOf(link.url);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      {/* Cover */}
      <button
        type="button"
        onClick={() => onOpen(link)}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-muted"
        aria-label={`Open ${link.title || domain}`}
      >
        {link.image ? (
          <Image
            src={link.image}
            alt={link.title || "Link preview"}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent">
            <Link2 className="size-8 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <Eye className="size-3" />
          {link.clickCount}
        </span>
      </button>

      {/* Favorite — overlaid, large tap target */}
      <button
        type="button"
        onClick={() => onToggleFavorite(link)}
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform active:scale-90"
        aria-label={link.favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star
          className={cn(
            "size-[18px] transition-colors",
            link.favorite ? "fill-primary text-primary" : "text-white"
          )}
        />
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <button
          type="button"
          onClick={() => onOpen(link)}
          className="text-left"
        >
          <h3 className="line-clamp-2 font-medium leading-snug tracking-tight transition-colors group-hover:text-primary">
            {link.title || "Untitled"}
          </h3>
        </button>

        <p className="truncate text-xs text-muted-foreground">{domain}</p>

        {link.actress && (
          <div>
            <button type="button" onClick={() => onActressClick(link.actress!.name)}>
              <Badge
                variant="secondary"
                className="cursor-pointer font-normal hover:bg-secondary/70"
              >
                {link.actress.name}
              </Badge>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted-foreground">
            {new Date(link.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="More actions"
            >
              <MoreVertical className="size-[18px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(link)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(link)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
