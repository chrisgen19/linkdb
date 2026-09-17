"use client";

import * as React from "react";
import { Link2, Loader2, Sparkles, Star, Tag, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { Actress, Link } from "@/lib/types";
import { parseUserUrl } from "@/lib/url";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useKeepFocusedFieldInView,
  useKeyboardInset,
} from "@/hooks/use-keyboard-inset";
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

// Gap kept between the top of the visible area and the drawer while the keyboard is up.
const KEYBOARD_TOP_GAP = 12;

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
  const keyboard = useKeyboardInset(open && !isDesktop);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  useKeepFocusedFieldInView(scrollRef, keyboard);
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
      active={open}
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
    // repositionInputs off: vaul lifts the drawer by the keyboard height but
    // ignores visualViewport.offsetTop, so when iOS Safari also pans to the
    // focused input the shifts stack and the field lands above the screen
    // (vaul #619, #521). useKeyboardInset places it on the visible area instead.
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      repositionInputs={false}
    >
      {/* flex column with a bounded height so the body scrolls and every
          field stays reachable even with the on-screen keyboard up. */}
      <DrawerContent
        className="flex max-h-[90svh] flex-col"
        style={
          keyboard
            ? {
                bottom: keyboard.bottom,
                maxHeight: keyboard.height - KEYBOARD_TOP_GAP,
              }
            : undefined
        }
      >
        <DrawerHeader className="shrink-0 pb-1">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
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
  /** False once the sheet starts closing; cancels any in-flight save. */
  active: boolean;
}

// The server may fall back to a headless browser, which can take about a minute.
const METADATA_TIMEOUT_MS = 70_000;

interface PageMeta {
  url: string;
  title: string | null;
  image: string | null;
}

/** A signal that aborts when `signal` does or after `ms`, whichever comes first. */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function LinkForm({
  editingLink,
  actresses,
  onSaved,
  onActressCreated,
  onClose,
  autoFocusUrl,
  active,
}: LinkFormProps) {
  const isEditing = !!editingLink;
  const [url, setUrl] = React.useState("");
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const saveRef = React.useRef<AbortController | null>(null);
  const [favorite, setFavorite] = React.useState(false);
  const [actressInput, setActressInput] = React.useState("");
  // Committed actress pills. New (just-typed) names have id === null and are
  // resolved to real actresses on submit; existing ones carry their id.
  const [pills, setPills] = React.useState<{ id: string | null; name: string }[]>(
    []
  );
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Closing the sheet (Cancel, swipe, Esc, backdrop) cancels an in-flight save
  // instead of letting it finish in the background.
  React.useEffect(() => {
    if (!active) return;
    return () => saveRef.current?.abort();
  }, [active]);

  // Sync the form to the link being edited whenever it changes.
  React.useEffect(() => {
    setUrlError(null);
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
    // Throw rather than returning [] — a silent empty set would make the
    // PATCH/POST below wipe every existing tag on a transient failure.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Couldn't save the actress tags");
    }
    const resolved: Actress[] = await res.json();
    resolved.forEach(onActressCreated);
    return resolved.map((a) => a.id);
  }

  /**
   * Best-effort title/cover lookup: falls back to URL-only on network errors,
   * timeouts and 5xx, but throws on a 4xx (invalid or already-saved URL).
   */
  async function fetchMetadata(href: string, signal: AbortSignal): Promise<PageMeta> {
    const fallback: PageMeta = { url: href, title: null, image: null };
    let res: Response;
    try {
      res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: href }),
        signal: withTimeout(signal, METADATA_TIMEOUT_MS),
      });
    } catch (metaErr) {
      if (!signal.aborted) {
        console.error("Metadata fetch failed, saving URL only:", metaErr);
      }
      return fallback;
    }
    if (res.ok) return res.json();
    if (res.status < 500) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Invalid URL");
    }
    return fallback;
  }

  async function createLink(metadata: PageMeta, actressIds: string[]) {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metadata, favorite, actressIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save link");
    }
    onSaved(await res.json(), "create");
    toast.success(metadata.title ? `Saved “${metadata.title}”` : "Link saved");
  }

  async function updateLink(id: string, actressIds: string[]) {
    const res = await fetch("/api/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, favorite, actressIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update link");
    }
    onSaved(await res.json(), "update");
    toast.success("Link updated");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The form is noValidate so a bare "example.com" gets https:// added
    // instead of being rejected by the browser.
    const href = editingLink ? editingLink.url : parseUserUrl(url);
    if (!href) {
      setUrlError(
        url.trim() ? "Enter a valid web address, like example.com/page" : "Enter a URL"
      );
      return;
    }
    setUrlError(null);
    if (!editingLink) setUrl(href);

    const controller = new AbortController();
    saveRef.current = controller;
    const { signal } = controller;
    setLoading(true);

    let committed = false;
    try {
      // The lookup runs before any tags are created: it can be cancelled or
      // reject the URL (duplicate, invalid), and neither should leave tags behind.
      const metadata = editingLink ? null : await fetchMetadata(href, signal);
      // Closed before saving: save nothing.
      if (signal.aborted) return;
      // From here the save (tags, then link) finishes and reports errors, even
      // if the sheet closes.
      committed = true;
      const actressIds = await resolveActressIds();
      if (editingLink) await updateLink(editingLink.id, actressIds);
      else if (metadata) await createLink(metadata, actressIds);
      // Don't close a sheet the user has since closed or reopened for another link.
      if (!signal.aborted) onClose();
    } catch (err) {
      if (signal.aborted && !committed) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 pt-2">
      {/* URL */}
      <div data-field className="space-y-2">
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
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(null);
          }}
          placeholder="https://example.com/…"
          required
          aria-invalid={!!urlError}
          aria-describedby={urlError ? "url-error" : undefined}
          disabled={loading || isEditing}
          readOnly={isEditing}
          className={cn("h-12", urlError && "border-destructive")}
          autoFocus={autoFocusUrl}
        />
        {urlError && (
          <p id="url-error" role="alert" className="text-xs text-destructive">
            {urlError}
          </p>
        )}
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            The URL can&apos;t be changed when editing.
          </p>
        )}
      </div>

      {/* Actress combobox */}
      <div data-field className="space-y-2">
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
          // Stays enabled while saving: closing cancels the save.
          onClick={onClose}
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
