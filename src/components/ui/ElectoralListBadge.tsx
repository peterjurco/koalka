import { isElectoralList, thresholdForParty } from '../../core/coalition/electoralLists.ts';
import type { ElectionRules, Party } from '../../data/types.ts';

/**
 * Small "koalícia" pill shown next to an electoral list (several parties on one candidate
 * list, e.g. PS + Demokrati), with the higher threshold it has to clear.
 * Renders nothing for an ordinary party.
 */
export function ElectoralListBadge({
  party,
  rules,
  compact = false,
}: {
  party: Party | undefined;
  rules: Pick<ElectionRules, 'thresholdPercent' | 'coalitionThresholdPercent' | 'largeCoalitionThresholdPercent'>;
  compact?: boolean;
}) {
  if (!party || !isElectoralList(party)) return null;
  const threshold = thresholdForParty(party, rules);
  const title = `Volebná koalícia ${party.members!.length} strán na spoločnej kandidátke – kvórum ${threshold} %`;
  return (
    <span className="list-badge" title={title} aria-label={title}>
      {compact ? `${threshold} %` : `koalícia · ${threshold} %`}
    </span>
  );
}
