import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { PeriodType } from "@/lib/periodUtils";

interface SummaryTabsProps {
  value: PeriodType;
  onValueChange: (value: PeriodType) => void;
  children: React.ReactNode;
}

export function SummaryTabs({ value, onValueChange, children }: SummaryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as PeriodType)}>
      <TabsList>
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="weekly">Weekly</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
