"use client";

import * as React from "react";
import Image from "next/image";
import { Images, User } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActressSummary } from "@/lib/types";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ActressCardProps {
  actress: ActressSummary;
  onClick: (name: string) => void;
}

export function ActressCard({ actress, onClick }: ActressCardProps) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Working set of images; a layer that fails to load is dropped so we never
  // crossfade to a broken thumbnail.
  const [images, setImages] = React.useState(actress.images);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setImages(actress.images);
    setIndex(0);
  }, [actress.images]);

  // Auto-advance the crossfade for actresses with more than one thumbnail.
  // A random interval per card keeps the grid from flipping in unison.
  React.useEffect(() => {
    if (images.length <= 1 || reduceMotion) return;
    const period = 3200 + Math.random() * 2400;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, period);
    return () => clearInterval(timer);
  }, [images.length, reduceMotion]);

  const handleError = (src: string) => {
    setImages((prev) => (prev.length > 1 ? prev.filter((s) => s !== src) : prev));
    setIndex(0);
  };

  const active = images.length ? index % images.length : 0;

  return (
    <button
      type="button"
      onClick={() => onClick(actress.name)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Cover — same proportions as the link cards */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {images.length > 0 ? (
          images.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={actress.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className={cn(
                "object-cover transition-opacity duration-[1200ms] ease-in-out group-hover:scale-[1.04]",
                i === active ? "opacity-100" : "opacity-0"
              )}
              unoptimized
              referrerPolicy="no-referrer"
              onError={() => handleError(src)}
            />
          ))
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent">
            <User className="size-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Slideshow dots (only when multiple images) */}
        {images.length > 1 && (
          <div className="absolute right-2 top-2 flex gap-1">
            {images.map((src, i) => (
              <span
                key={src}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === active ? "bg-white" : "bg-white/40"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="line-clamp-1 font-medium leading-snug tracking-tight transition-colors group-hover:text-primary">
          {actress.name}
        </h3>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Images className="size-3.5" />
          {actress.count} {actress.count === 1 ? "link" : "links"}
        </p>
      </div>
    </button>
  );
}
