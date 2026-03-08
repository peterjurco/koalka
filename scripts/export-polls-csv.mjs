import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data", "sk");

const pollsPath = path.join(dataDir, "polls.json");
const partiesPath = path.join(dataDir, "parties.json");

const polls = JSON.parse(fs.readFileSync(pollsPath, "utf8"));
const parties = JSON.parse(fs.readFileSync(partiesPath, "utf8"));

const partyOrder = new Map(parties.map((p, i) => [p.id, p.order ?? i]));

function getPartyColumnOrder(partyIds) {
  const seen = new Set(partyIds);
  const ordered = [...parties.map((p) => p.id).filter((id) => seen.has(id))];
  const rest = [...partyIds].filter((id) => !partyOrder.has(id)).sort();
  return [...ordered, ...rest];
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(agencyName) {
  const agencyPolls = polls
    .filter((p) => p.agency === agencyName)
    .sort((a, b) => (a.fieldworkEnd <= b.fieldworkEnd ? -1 : 1));

  const allPartyIds = [
    ...new Set(agencyPolls.flatMap((p) => Object.keys(p.results || {}))),
  ];
  const columns = getPartyColumnOrder(allPartyIds);

  const header = ["date", ...columns];
  const rows = agencyPolls.map((poll) => {
    const results = poll.results || {};
    const date = poll.fieldworkEnd;
    const cells = [date, ...columns.map((pid) => results[pid] ?? "")];
    return cells.map(escapeCsvCell).join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

const focusCsv = buildCsv("Focus");
const akoCsv = buildCsv("AKO");

fs.writeFileSync(path.join(rootDir, "focus-polls.csv"), focusCsv, "utf8");
fs.writeFileSync(path.join(rootDir, "ako-polls.csv"), akoCsv, "utf8");

console.log("Wrote focus-polls.csv and ako-polls.csv to project root.");
