"use client";

import * as React from "react";
import { Check, Copy, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";

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

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps) {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [copied, setCopied] = React.useState<"token" | "endpoint" | null>(null);

  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/links/quick-add`
      : "/api/links/quick-add";

  // Fetch (and lazily create) the token when the dialog opens.
  React.useEffect(() => {
    if (!open || token) return;
    setLoading(true);
    fetch("/api/token")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setToken(d.token))
      .catch(() => toast.error("Could not load your token"))
      .finally(() => setLoading(false));
  }, [open, token]);

  async function regenerate() {
    setRegenerating(true);
    try {
      const r = await fetch("/api/token", { method: "POST" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setToken(d.token);
      toast.success("Token regenerated — update your Shortcut");
    } catch {
      toast.error("Could not regenerate token");
    } finally {
      setRegenerating(false);
    }
  }

  async function copy(value: string, which: "token" | "endpoint") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            Save from iPhone
          </DialogTitle>
          <DialogDescription>
            Use an Apple Shortcut to save links straight from the Share Sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Token */}
          <div className="space-y-1.5">
            <Label>Your token</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={loading ? "Loading…" : token ?? ""}
                className="font-mono text-xs"
                onFocusCapture={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy token"
                disabled={!token}
                onClick={() => token && copy(token, "token")}
              >
                {copied === "token" ? <Check className="text-primary" /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Treat this like a password. Anyone with it can add links to your
              account.
            </p>
          </div>

          {/* Endpoint */}
          <div className="space-y-1.5">
            <Label>Endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={endpoint} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy endpoint"
                onClick={() => copy(endpoint, "endpoint")}
              >
                {copied === "endpoint" ? <Check className="text-primary" /> : <Copy />}
              </Button>
            </div>
          </div>

          {/* Recipe */}
          <div className="rounded-lg border bg-muted/40 p-3.5">
            <p className="mb-2 text-sm font-medium">Apple Shortcut setup</p>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>Shortcuts app → <b>＋</b> → enable <b>Show in Share Sheet</b> (accept <b>URLs</b>).</li>
              <li>Add <b>Get Contents of URL</b>:</li>
              <li className="list-none rounded-md bg-background p-2 font-mono">
                URL: the Endpoint above
                <br />Method: <b>POST</b>
                <br />Headers: <b>Authorization</b> = <b>Bearer {token ? "<your token>" : "…"}</b>
                <br />Request Body: <b>JSON</b> → key <b>url</b> = <b>Shortcut Input</b>
              </li>
              <li>Name it “Save to LinkDB”. Now share any page → <b>Save to LinkDB</b>.</li>
            </ol>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={regenerate}
            disabled={regenerating}
            className="w-full text-muted-foreground"
          >
            {regenerating ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Regenerate token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
