"use client";

import * as React from "react";
import Image from "next/image";
import { User } from "lucide-react";

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
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-muted text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {images.length > 0 ? (
        images.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={actress.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            className={cn(
              "object-cover transition-opacity duration-[1200ms] ease-in-out group-hover:scale-[1.05]",
              i === active ? "opacity-100" : "opacity-0"
            )}
            unoptimized
            referrerPolicy="no-referrer"
            onError={() => handleError(src)}
          />
        ))
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent">
          <User className="size-9 text-muted-foreground/40" />
        </div>
      )}

      {/* Gradient + label */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-3 pt-8">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {actress.name}
        </p>
        <p className="mt-0.5 text-[11px] text-white/70">
          {actress.count} {actress.count === 1 ? "link" : "links"}
        </p>
      </div>

      {/* Slideshow dots (only when multiple images) */}
      {images.length > 1 && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
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
    </button>
  );
}
