import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface ApiKeyDrawerProps {
  children: React.ReactNode;
}

export function ApiKeyDrawer({ children }: ApiKeyDrawerProps) {
  const [open, setOpen] = useState(false);
  const user = useQuery(api.users.getCurrent);
  const updateApiKeys = useMutation(api.users.updateApiKeys);

  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [preferredProvider, setPreferredProvider] = useState<"openai" | "anthropic">("openai");

  // Initialize form when user data loads or drawer opens
  useEffect(() => {
    if (open && user?.apiKeys) {
      setOpenaiKey(user.apiKeys.openai || "");
      setAnthropicKey(user.apiKeys.anthropic || "");
      setPreferredProvider(user.apiKeys.preferredProvider || "openai");
    }
  }, [open, user]);

  const handleSave = async () => {
    await updateApiKeys({
      openai: openaiKey || undefined,
      anthropic: anthropicKey || undefined,
      preferredProvider,
    });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>API Keys</SheetTitle>
          <SheetDescription>
            Configure your AI provider API keys. These are stored securely and
            used to generate activity summaries.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <Input
              id="openai-key"
              type="password"
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your OpenAI API key (required for OpenAI provider)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="anthropic-key">Anthropic API Key</Label>
            <Input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your Anthropic API key (required for Anthropic provider)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Preferred Provider</Label>
            <Select
              id="provider"
              value={preferredProvider}
              onChange={(e) => {
                const value = e.target.value as "openai" | "anthropic";
                setPreferredProvider(value);
              }}
            >
              <option value="openai">OpenAI (GPT-4o-mini)</option>
              <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which AI provider to use by default
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
