import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Repository } from "../../../convex/types";

interface RepoCardProps {
  repository: Repository;
}

export function RepoCard({ repository }: RepoCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{repository.fullName}</CardTitle>
          {repository.isPrivate && (
            <Badge variant="outline">Private</Badge>
          )}
        </div>
        <CardDescription>
          Connected repository
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Owner:</span> {repository.owner}
          </div>
          {repository.defaultBranch && (
            <div>
              <span className="font-medium">Default branch:</span> {repository.defaultBranch}
            </div>
          )}
          <div>
            <a
              href={`https://github.com/${repository.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              View on GitHub →
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
