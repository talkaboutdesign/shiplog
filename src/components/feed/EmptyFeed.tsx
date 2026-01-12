import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EmptyFeed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No activity yet</CardTitle>
        <CardDescription>
          Activity summaries will appear here once events are processed
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Push commits or open pull requests to see them appear
          as AI-generated summaries.
        </p>
      </CardContent>
    </Card>
  );
}
