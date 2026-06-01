"use client";

import * as React from "react";
import { Link2, Loader2, Sparkles, Star, Tag, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { Actress, Link } from "@/lib/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface AddLinkSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLink: Link | null;
  actresses: Actress[];
  onSaved: (link: Link, mode: "create" | "update") => void;
  onActressCreated: (actress: Actress) => void;
}

export function AddLinkSheet({
  open,
  onOpenChange,
  editingLink,
  actresses,
  onSaved,
  onActressCreated,
}: AddLinkSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isEditing = !!editingLink;
  const title = isEditing ? "Edit link" : "Add a link";
  const description = isEditing
    ? "Update the favorite and actress tag for this link."
    : "Paste a URL — we'll fetch the title and cover automatically.";

  const form = (autoFocusUrl: boolean) => (
    <LinkForm
      editingLink={editingLink}
      actresses={actresses}
      onSaved={onSaved}
      onActressCreated={onActressCreated}
      onClose={() => onOpenChange(false)}
      autoFocusUrl={autoFocusUrl}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {form(!isEditing)}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    // shouldScaleBackground off: the background-scale animation is glitchy
    // without a vaul wrapper and can leave the content snapped off-screen.
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      {/* flex column with a bounded height so the body scrolls and every
          field stays reachable even with the on-screen keyboard up. */}
      <DrawerContent className="flex max-h-[90svh] flex-col">
        <DrawerHeader className="shrink-0 pb-1">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {/* Don't autofocus on mobile — popping the keyboard during the open
              animation can leave the drawer mis-positioned. */}
          {form(false)}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface LinkFormProps {
  editingLink: Link | null;
  actresses: Actress[];
  onSaved: (link: Link, mode: "create" | "update") => void;
  onActressCreated: (actress: Actress) => void;
  onClose: () => void;
  autoFocusUrl: boolean;
}

function LinkForm({
  editingLink,
  actresses,
  onSaved,
  onActressCreated,
  onClose,
  autoFocusUrl,
}: LinkFormProps) {
  const isEditing = !!editingLink;
  const [url, setUrl] = React.useState("");
  const [favorite, setFavorite] = React.useState(false);
  const [actressInput, setActressInput] = React.useState("");
  // Committed actress pills. New (just-typed) names have id === null and are
  // resolved to real actresses on submit; existing ones carry their id.
  const [pills, setPills] = React.useState<{ id: string | null; name: string }[]>(
    []
  );
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Sync the form to the link being edited whenever it changes.
  React.useEffect(() => {
    if (editingLink) {
      setUrl(editingLink.url);
      setFavorite(editingLink.favorite);
      setActressInput("");
      setPills(editingLink.actresses.map((a) => ({ id: a.id, name: a.name })));
    } else {
      setUrl("");
      setFavorite(false);
      setActressInput("");
      setPills([]);
    }
  }, [editingLink]);

  function addPill(name: string, id: string | null = null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPills((prev) =>
      prev.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { id, name: trimmed }]
    );
  }

  function removePill(index: number) {
    setPills((prev) => prev.filter((_, i) => i !== index));
  }

  function handleInputChange(value: string) {
    // A comma (typed or pasted) commits each complete segment as a pill.
    if (value.includes(",")) {
      const parts = value.split(",");
      const remainder = parts.pop() ?? "";
      parts.forEach((p) => addPill(p));
      setActressInput(remainder);
    } else {
      setActressInput(value);
    }
    setShowDropdown(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && actressInput.trim()) {
      e.preventDefault();
      addPill(actressInput);
      setActressInput("");
      setShowDropdown(false);
    } else if (e.key === "Backspace" && !actressInput && pills.length > 0) {
      removePill(pills.length - 1);
    }
  }

  const filteredActresses = React.useMemo(() => {
    const q = actressInput.trim().toLowerCase();
    const taken = new Set(pills.map((p) => p.name.toLowerCase()));
    const pool = actresses.filter((a) => !taken.has(a.name.toLowerCase()));
    if (!q) return pool.slice(0, 8);
    return pool.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [actressInput, actresses, pills]);

  const showCreateOption =
    actressInput.trim().length > 0 &&
    !actresses.some(
      (a) => a.name.toLowerCase() === actressInput.trim().toLowerCase()
    ) &&
    !pills.some(
      (p) => p.name.toLowerCase() === actressInput.trim().toLowerCase()
    );

  /** Find-or-create every pill (plus any trailing text) → actress ids. */
  async function resolveActressIds(): Promise<string[]> {
    const names = pills.map((p) => p.name);
    const trailing = actressInput.trim();
    if (trailing) names.push(trailing);
    if (names.length === 0) return [];
    const res = await fetch("/api/actresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    if (!res.ok) return [];
    const resolved: Actress[] = await res.json();
    resolved.forEach(onActressCreated);
    return resolved.map((a) => a.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const actressIds = await resolveActressIds();

      if (editingLink) {
        const res = await fetch("/api/links", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingLink.id, favorite, actressIds }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update link");
        }
        onSaved(await res.json(), "update");
        toast.success("Link updated");
        onClose();
        return;
      }

      // Fetch metadata (best-effort), then save.
      let metadata: { url: string; title: string | null; image: string | null } = {
        url,
        title: null,
        image: null,
      };
      let metaRes: Response | null = null;
      try {
        metaRes = await fetch("/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(70_000),
        });
      } catch (metaErr) {
        console.error("Metadata fetch failed, saving URL only:", metaErr);
      }
      if (metaRes) {
        if (metaRes.ok) {
          metadata = await metaRes.json();
        } else if (metaRes.status < 500) {
          const data = await metaRes.json().catch(() => ({}));
          throw new Error(data.error || "Invalid URL");
        }
      }

      const saveRes = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metadata, favorite, actressIds }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save link");
      }
      onSaved(await saveRes.json(), "create");
      toast.success(
        metadata.title ? `Saved “${metadata.title}”` : "Link saved"
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
      {/* URL */}
      <div className="space-y-2">
        <Label htmlFor="url" className="flex items-center gap-1.5">
          <Link2 className="size-3.5 text-muted-foreground" /> URL
        </Label>
        <Input
          id="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="go"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/…"
          required
          disabled={loading || isEditing}
          readOnly={isEditing}
          className="h-12"
          autoFocus={autoFocusUrl}
        />
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            The URL can&apos;t be changed when editing.
          </p>
        )}
      </div>

      {/* Actress combobox */}
      <div className="space-y-2">
        <Label htmlFor="actress" className="flex items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" /> Actress
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="relative">
          {/* Tag-pill input: each committed actress shows as a removable chip. */}
          <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
            {pills.map((pill, i) => (
              <span
                key={pill.id ?? `new-${pill.name}`}
                className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
              >
                {pill.name}
                <button
                  type="button"
                  onClick={() => removePill(i)}
                  disabled={loading}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  aria-label={`Remove ${pill.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              id="actress"
              value={actressInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={pills.length ? "Add another…" : "Search or add tags"}
              autoComplete="off"
              disabled={loading}
              className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
          </div>

          {showDropdown && (filteredActresses.length > 0 || showCreateOption) && (
            <div className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1.5 shadow-lg scrollbar-thin">
              {filteredActresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    addPill(a.name, a.id);
                    setActressInput("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                  {a.name}
                </button>
              ))}
              {showCreateOption && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    addPill(actressInput);
                    setActressInput("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-primary hover:bg-accent"
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  Create “{actressInput.trim()}”
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Favorite toggle — big tap target */}
      <button
        type="button"
        onClick={() => setFavorite((v) => !v)}
        disabled={loading}
        className={cn(
          "flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors",
          favorite
            ? "border-primary/40 bg-primary/5"
            : "border-input hover:bg-accent/60"
        )}
      >
        <span className="flex items-center gap-3">
          <Star
            className={cn(
              "size-5 transition-colors",
              favorite
                ? "fill-primary text-primary"
                : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-medium">Mark as favorite</span>
        </span>
        <span
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            favorite ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-background shadow transition-all",
              favorite ? "left-[1.375rem]" : "left-0.5"
            )}
          />
        </span>
      </button>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onClose}
          disabled={loading}
          className="sm:w-auto"
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={loading} className="sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              {isEditing ? "Updating…" : "Saving…"}
            </>
          ) : isEditing ? (
            "Update link"
          ) : (
            "Save link"
          )}
        </Button>
      </div>
    </form>
  );
}
