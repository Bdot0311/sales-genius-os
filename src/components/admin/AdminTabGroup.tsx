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
      {/* Scrolls rather than wrapping. Wrapping put a second row of navigation
          above the content on any narrow window, which is the thing the admin
          shell had too much of already. */}
      <div className="-mx-1 mb-5 overflow-x-auto px-1">
        <TabsList className="inline-flex h-auto w-auto justify-start gap-1 bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[0.75rem] font-normal text-muted-foreground data-[state=active]:bg-muted/60 data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {active === tab.value ? tab.element : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
