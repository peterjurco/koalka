/**
 * Print the document the poll watch agent would hand to the extraction model for one URL —
 * after the resolve step (PDF/CSV follow, Flourish chart data). Needs no API key.
 *
 *   npm run agent:doc -- https://nms.global/sk/volebny-model-november-2026/
 *   npm run agent:doc -- <url> --charts-only   # just the appended Flourish block
 */
import { resolveLeadDocument } from './resolveDocument.ts';

const MARKER = '--- Údaje z grafov na stránke (Flourish) ---';

async function main(): Promise<void> {
  const url = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  if (url == null) {
    console.error('Usage: npm run agent:doc -- <url> [--charts-only]');
    process.exit(1);
  }

  const doc = await resolveLeadDocument(url);
  const markerAt = doc.text.indexOf(MARKER);
  const text = process.argv.includes('--charts-only')
    ? markerAt >= 0
      ? doc.text.slice(markerAt)
      : '(no Flourish charts on this page)'
    : doc.text;

  console.log(text);
  console.error(
    `\n${doc.kind.toUpperCase()} ${doc.url} — ${doc.text.length} chars` +
      (markerAt >= 0 ? ', includes Flourish chart data' : ', no Flourish chart data'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
