import { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface AdminGroupTab {
  value: string;
  label: string;
  element: ReactNode;
}

interface AdminTabGroupProps {
  tabs: AdminGroupTab[];
}

/**
 * Renders a set of related admin pages as tabs on a single page.
 * The active tab is kept in the `?tab=` query param so links and
 * refreshes land on the right sub-page.
 */
export function AdminTabGroup({ tabs }: AdminTabGroupProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const active = tabs.some((t) => t.value === requested) ? requested! : tabs[0].value;

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={active} onValueChange={handleChange} className="w-full">
      <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {active === tab.value ? tab.element : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
