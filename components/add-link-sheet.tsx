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

  const form = (
    <LinkForm
      editingLink={editingLink}
      actresses={actresses}
      onSaved={onSaved}
      onActressCreated={onActressCreated}
      onClose={() => onOpenChange(false)}
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
          {form}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {form}
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
}

function LinkForm({
  editingLink,
  actresses,
  onSaved,
  onActressCreated,
  onClose,
}: LinkFormProps) {
  const isEditing = !!editingLink;
  const [url, setUrl] = React.useState("");
  const [favorite, setFavorite] = React.useState(false);
  const [actressInput, setActressInput] = React.useState("");
  const [selectedActress, setSelectedActress] =
    React.useState<Actress | null>(null);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Sync the form to the link being edited whenever it changes.
  React.useEffect(() => {
    if (editingLink) {
      setUrl(editingLink.url);
      setFavorite(editingLink.favorite);
      setActressInput(editingLink.actress?.name ?? "");
      setSelectedActress(editingLink.actress);
    } else {
      setUrl("");
      setFavorite(false);
      setActressInput("");
      setSelectedActress(null);
    }
  }, [editingLink]);

  const filteredActresses = React.useMemo(() => {
    const q = actressInput.trim().toLowerCase();
    if (!q) return actresses.slice(0, 8);
    return actresses
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [actressInput, actresses]);

  const showCreateOption =
    actressInput.trim().length > 0 &&
    !actresses.some(
      (a) => a.name.toLowerCase() === actressInput.trim().toLowerCase()
    );

  async function resolveActressId(): Promise<string | null> {
    if (selectedActress) return selectedActress.id;
    if (!actressInput.trim()) return null;
    const res = await fetch("/api/actresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: actressInput.trim() }),
    });
    if (!res.ok) return null;
    const actress: Actress = await res.json();
    onActressCreated(actress);
    return actress.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const actressId = await resolveActressId();

      if (editingLink) {
        const res = await fetch("/api/links", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingLink.id, favorite, actressId }),
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
        body: JSON.stringify({ ...metadata, favorite, actressId }),
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
          autoFocus={!isEditing}
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
          <Input
            id="actress"
            value={actressInput}
            onChange={(e) => {
              setActressInput(e.target.value);
              setSelectedActress(null);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search or add a tag"
            autoComplete="off"
            disabled={loading}
            className="h-12"
          />
          {selectedActress && (
            <button
              type="button"
              onClick={() => {
                setSelectedActress(null);
                setActressInput("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              aria-label="Clear actress"
            >
              <X className="size-4" />
            </button>
          )}

          {showDropdown && (filteredActresses.length > 0 || showCreateOption) && (
            <div className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1.5 shadow-lg scrollbar-thin">
              {filteredActresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedActress(a);
                    setActressInput(a.name);
                    setShowDropdown(false);
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
                  onClick={() => setShowDropdown(false)}
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
