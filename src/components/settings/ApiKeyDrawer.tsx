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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApiKeyDrawerProps {
  children: React.ReactNode;
}

export function ApiKeyDrawer({ children }: ApiKeyDrawerProps) {
  const [open, setOpen] = useState(false);
  const user = useQuery(api.users.getCurrent);
  const updateApiKeys = useMutation(api.users.updateApiKeys);

  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("openai/gpt-4o-mini");
  const [preferredProvider, setPreferredProvider] = useState<"openai" | "anthropic" | "openrouter">("openai");

  // Popular OpenRouter models
  const openRouterModels = [
    { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
    { value: "openai/gpt-4o", label: "OpenAI GPT-4o" },
    { value: "openai/gpt-4-turbo", label: "OpenAI GPT-4 Turbo" },
    { value: "openai/gpt-3.5-turbo", label: "OpenAI GPT-3.5 Turbo" },
    { value: "anthropic/claude-3.5-haiku", label: "Anthropic Claude 3.5 Haiku" },
    { value: "anthropic/claude-3.5-sonnet", label: "Anthropic Claude 3.5 Sonnet" },
    { value: "anthropic/claude-3-opus", label: "Anthropic Claude 3 Opus" },
    { value: "google/gemini-pro-1.5", label: "Google Gemini Pro 1.5" },
    { value: "google/gemini-flash-1.5", label: "Google Gemini Flash 1.5" },
    { value: "meta-llama/llama-3.1-70b-instruct", label: "Meta Llama 3.1 70B" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "Meta Llama 3.1 8B" },
    { value: "mistralai/mistral-large", label: "Mistral Large" },
    { value: "mistralai/mixtral-8x7b-instruct", label: "Mistral Mixtral 8x7B" },
  ];

  // Initialize form when user data loads or drawer opens
  useEffect(() => {
    if (open && user?.apiKeys) {
      setOpenaiKey(user.apiKeys.openai || "");
      setAnthropicKey(user.apiKeys.anthropic || "");
      setOpenrouterKey(user.apiKeys.openrouter || "");
      setOpenrouterModel(user.apiKeys.openrouterModel || "openai/gpt-4o-mini");
      setPreferredProvider(user.apiKeys.preferredProvider || "openai");
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      await updateApiKeys({
        openai: openaiKey || undefined,
        anthropic: anthropicKey || undefined,
        openrouter: openrouterKey || undefined,
        openrouterModel: openrouterModel || undefined,
        preferredProvider,
      });
      setOpen(false);
    } catch (error) {
      console.error("Failed to save API keys:", error);
      // You might want to show an error toast/alert here
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="flex flex-col w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>API Keys</SheetTitle>
          <SheetDescription>
            Configure your AI provider API keys. These are stored securely and
            used to generate activity summaries.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto mt-6 space-y-6 pr-2">
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
            <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
            <Input
              id="openrouter-key"
              type="password"
              placeholder="sk-or-..."
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your OpenRouter API key (required for OpenRouter provider)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openrouter-model">OpenRouter Model</Label>
            <Select
              value={openrouterModel}
              onValueChange={setOpenrouterModel}
            >
              <SelectTrigger id="openrouter-model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {openRouterModels.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which model to use with OpenRouter
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Preferred Provider</Label>
            <Select
              value={preferredProvider}
              onValueChange={(value) => {
                setPreferredProvider(value as "openai" | "anthropic" | "openrouter");
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude 3.5 Haiku)</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which AI provider to use by default
            </p>
          </div>

          <div className="flex justify-end gap-2 pb-4">
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
