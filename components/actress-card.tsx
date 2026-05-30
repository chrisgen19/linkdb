"use client";

import * as React from "react";
import Image from "next/image";
import { User } from "lucide-react";

import type { ActressSummary } from "@/lib/types";

interface ActressCardProps {
  actress: ActressSummary;
  onClick: (name: string) => void;
}

export function ActressCard({ actress, onClick }: ActressCardProps) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const showImage = !!actress.image && !imageFailed;

  React.useEffect(() => {
    setImageFailed(false);
  }, [actress.image]);

  return (
    <button
      type="button"
      onClick={() => onClick(actress.name)}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-muted text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {showImage ? (
        <Image
          src={actress.image!}
          alt={actress.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent">
          <User className="size-9 text-muted-foreground/40" />
        </div>
      )}

      {/* Gradient + label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-3 pt-8">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {actress.name}
        </p>
        <p className="mt-0.5 text-[11px] text-white/70">
          {actress.count} {actress.count === 1 ? "link" : "links"}
        </p>
      </div>
    </button>
  );
}
