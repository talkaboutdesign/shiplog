import { Button } from "@/components/ui/button";

interface InstallButtonProps {
  appSlug: string;
}

export function InstallButton({ appSlug }: InstallButtonProps) {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;

  return (
    <Button asChild>
      <a href={installUrl} target="_blank" rel="noopener noreferrer">
        Install on GitHub
      </a>
    </Button>
  );
}
