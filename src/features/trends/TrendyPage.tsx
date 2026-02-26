import { useState, useCallback } from "react";
import type { PartyId } from "../../data/types.ts";
import { useStore } from "../../state/store.ts";
import { PollsToolbar } from "../polls/PollsToolbar.tsx";
import { PartyTrendChart } from "./PartyTrendChart.tsx";
import { TrendySidebar } from "./TrendySidebar.tsx";
import type { TrendySidebarState } from "./TrendySidebar.tsx";

export function TrendyPage() {
  const { config, electionId } = useStore();
  const [sidebarState, setSidebarState] = useState<TrendySidebarState>({
    visiblePartyIds: new Set<PartyId>(),
    customSums: [],
    visibleSumIds: new Set(),
  });

  const handleSidebarStateChange = useCallback((state: TrendySidebarState) => {
    setSidebarState(state);
  }, []);

  if (!config) return null;

  return (
    <div className="trendy-layout">
      <TrendySidebar
        parties={config.parties}
        electionId={electionId}
        onStateChange={handleSidebarStateChange}
      />

      <div className="trendy-content">
        <PollsToolbar />
        <PartyTrendChart
          visiblePartyIds={sidebarState.visiblePartyIds}
          customSums={sidebarState.customSums}
          visibleSumIds={sidebarState.visibleSumIds}
        />
      </div>
    </div>
  );
}
