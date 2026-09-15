# MLB Division Race Charts

This repository is a customized fork of Greg Stoll's
[baseballdivisionraces](https://github.com/gregstoll/baseballdivisionraces)
project. Greg created the original application and described its design in
[this project write-up](https://gregstoll.wordpress.com/2021/07/03/new-project-baseball-division-race-charts/).
You can also view [Greg's original production version](https://gregstoll.com/baseballdivisionraces/).

## Enhancements in this fork

- Added a single global team-color editor. A team's selected color is used in
  every chart and saved in the browser for future visits.
- Added a favorite-team selector. The selected team's line is emphasized in
  every chart and the preference is saved in the browser.
- Added American League and National League Wild Card race charts.
- Added live postseason-race tables beneath both Wild Card charts, including
  division leaders, Wild Card slots, teams in the hunt, and record-based magic
  and tragic numbers.
- Added a dashed playoff-cutoff line to each Wild Card chart at the current
  third-place position, with the label placed on the left to keep recent data
  unobstructed.
- Made chart widths responsive so the graphs expand and contract with the
  browser window.
- Added a vertical-scale selector with `1.0`, `1.5`, and `2.0` options.
- Added live standings refreshes every six hours and a **Refresh Standings**
  button for an immediate manual update.
- Added a daily FanGraphs playoff-odds snapshot with current postseason and
  division probabilities for all 30 teams. Current odds also appear beside
  team names in chart legends.
- Updated the interface and charts to use the Inter font.
- Updated the included 2026 standings data beyond the original early-season
  sample.

## How it works

Standings data is gathered by
[`getmlbstandings.py`](getmlbstandings/getmlbstandings.py), which uses the
[MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI) Python package.

The website source is [`app.ts`](showdivisionraces/src/app.ts), and the charts
are rendered with [Plotly](https://plotly.com/javascript/). The original
dark-mode/light-mode toggle code is credited to
[Ryan Feigenbaum](https://ryanfeigenbaum.com/dark-mode/).

Current playoff probabilities are stored in
[`fangraphs-playoff-odds.json`](showdivisionraces/public/data/fangraphs-playoff-odds.json).
The build validates that the snapshot contains 30 unique teams and valid
probabilities before publishing it.

## Running locally on macOS

Double-click **Start MLB Charts.command** in Finder. The launcher starts the
local development server and opens <http://127.0.0.1:8080/> automatically.
Keep the Terminal window open while using the site, and press `Control-C` in
that window when you want to stop the server.

Node.js is required. On the first launch, the script installs the project's npm
dependencies if they are not already present.
