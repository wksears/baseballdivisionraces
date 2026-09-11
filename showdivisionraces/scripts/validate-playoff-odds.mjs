import { readFile } from "node:fs/promises";

const fileUrl = new URL("../public/data/fangraphs-playoff-odds.json", import.meta.url);
const snapshot = JSON.parse(await readFile(fileUrl, "utf8"));
const probabilityFields = ["makePlayoffs", "winDivision", "clinchBye", "winWorldSeries"];

if (snapshot.source !== "FanGraphs" || snapshot.model !== "FanGraphs") {
  throw new Error("The playoff-odds snapshot must identify FanGraphs as its source and model.");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf || "")) {
  throw new Error("The playoff-odds snapshot needs an ISO asOf date.");
}
if (!Array.isArray(snapshot.teams) || snapshot.teams.length !== 30) {
  throw new Error("The playoff-odds snapshot must contain exactly 30 teams.");
}

const teamNames = new Set();
const abbreviations = new Set();
for (const team of snapshot.teams) {
  if (!team.team || !team.abbreviation || !["AL", "NL"].includes(team.league) || !["E", "C", "W"].includes(team.division)) {
    throw new Error(`Invalid team identity in the playoff-odds snapshot: ${JSON.stringify(team)}`);
  }
  teamNames.add(team.team);
  abbreviations.add(team.abbreviation);
  for (const field of probabilityFields) {
    if (typeof team[field] !== "number" || team[field] < 0 || team[field] > 1) {
      throw new Error(`Invalid ${field} value for ${team.team}.`);
    }
  }
}

if (teamNames.size !== 30 || abbreviations.size !== 30) {
  throw new Error("The playoff-odds snapshot contains duplicate teams.");
}

console.log(`Validated FanGraphs playoff odds for ${snapshot.asOf}.`);
