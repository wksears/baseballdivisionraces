import Plotly from 'plotly.js-basic-dist-min';

const MIN_YEAR = 1995;
const MAX_YEAR = 2026;

function next_day(d: Date) : Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function prev_day(d: Date) : Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
}

class TeamColors {
    _light: string;
    _dark: string;

    constructor(light: string, dark: string|undefined = undefined) {
        this._light = light;
        this._dark = dark ?? light;
    }
    // Color used in light mode
    get light() { 
        return this._light;
    }
    // Color used in dark mode
    get dark() { 
        return this._dark;
    }
}

const TEAM_NAMES_TO_COLORS : Map<string, TeamColors> = new Map([
    ["Houston Astros", new TeamColors("#eb6e1f")],
    ["Athletics", new TeamColors("#003831", "#efb21e")],
    // Lighten #005c5c to #00a0a0
    ["Seattle Mariners", new TeamColors("#00a0a0", "#005c5c")],
    ["Los Angeles Angels", new TeamColors("#862633")],
    ["Texas Rangers", new TeamColors("#c0111f")],

    // NYY blue #134a8e is too close to Blue Jays, use black for pinstripes
    ["New York Yankees", new TeamColors("#000000", "#c4ced3")],
    ["Baltimore Orioles", new TeamColors("#df4601")],
    // Lighten #134a8e to #1d71d9
    ["Toronto Blue Jays", new TeamColors("#134a8e", "#1d71d9")],
    ["Tampa Bay Rays", new TeamColors("#f5d130")],
    ["Boston Red Sox", new TeamColors("#bd3039")],

    // Darken #c4ced4 to #9dadb7
    ["Chicago White Sox", new TeamColors("#9dadb7", "#c4ced4")],
    ["Cleveland Guardians", new TeamColors("#e31937")],
    ["Detroit Tigers", new TeamColors("#f26722")],
    ["Kansas City Royals", new TeamColors("#7bb2dd")],
    ["Minnesota Twins", new TeamColors("#002b5c", "#cfac7a")],

    ["San Francisco Giants", new TeamColors("#fd5a1e")],
    ["Los Angeles Dodgers", new TeamColors("#005a9c")],
    ["San Diego Padres", new TeamColors("#847464", "#5c666f")],
    ["Colorado Rockies", new TeamColors("#33006f", "#c4ced4")],
    ["Arizona Diamondbacks", new TeamColors("#a71930")],

    // Lighten #002d72 to #005ce9
    ["New York Mets", new TeamColors("#002d72", "#005ce9")],
    ["Washington Nationals", new TeamColors("#ab0003")],
    ["Atlanta Braves", new TeamColors("#eaaa00")],
    ["Philadelphia Phillies", new TeamColors("#e81828", "#284898")],
    ["Miami Marlins", new TeamColors("#ff6600")],

    ["Milwaukee Brewers", new TeamColors("#b6922e")],
    // Lighten #0e3386 to #1650d3
    ["Chicago Cubs", new TeamColors("#1650d3")],
    ["Cincinnati Reds", new TeamColors("#c6011f")],
    // Lighten #c41e3a to #e03552
    ["St. Louis Cardinals", new TeamColors("#e03552", "#e03552")],
    ["Pittsburgh Pirates", new TeamColors("#000000", "#fdb827")]
]);
TEAM_NAMES_TO_COLORS.set("Cleveland Indians", TEAM_NAMES_TO_COLORS.get("Cleveland Guardians"));
TEAM_NAMES_TO_COLORS.set("California Angels", TEAM_NAMES_TO_COLORS.get("Los Angeles Angels"));
TEAM_NAMES_TO_COLORS.set("Anaheim Angels", TEAM_NAMES_TO_COLORS.get("Los Angeles Angels"));
TEAM_NAMES_TO_COLORS.set("Tampa Bay Devil Rays", TEAM_NAMES_TO_COLORS.get("Tampa Bay Rays"));
TEAM_NAMES_TO_COLORS.set("Florida Marlins", TEAM_NAMES_TO_COLORS.get("Miami Marlins"));
TEAM_NAMES_TO_COLORS.set("Montreal Expos", TEAM_NAMES_TO_COLORS.get("Washington Nationals"));
TEAM_NAMES_TO_COLORS.set("Oakland Athletics", TEAM_NAMES_TO_COLORS.get("Athletics"));

TEAM_NAMES_TO_COLORS.set("2025 Rockies", TEAM_NAMES_TO_COLORS.get("Colorado Rockies"));
TEAM_NAMES_TO_COLORS.set("2024 White Sox", TEAM_NAMES_TO_COLORS.get("Chicago White Sox"));
// Irritatingly these two teams have very similar dark colors
let rockies = TEAM_NAMES_TO_COLORS.get("2025 Rockies");
rockies = new TeamColors(rockies.light, "#87629d");
TEAM_NAMES_TO_COLORS.set("2025 Rockies", rockies);

const TEAM_COLOR_OVERRIDES_STORAGE_KEY = "baseballDivisionRaces.teamColorOverrides.v2";
const FAVORITE_TEAM_STORAGE_KEY = "baseballDivisionRaces.favoriteTeam.v1";
const LIVE_STANDINGS_CACHE_KEY_PREFIX = "baseballDivisionRaces.liveStandings.v1.";
const VERTICAL_SCALE_STORAGE_KEY = "baseballDivisionRaces.verticalScale.v1";
const CHART_RANGE_STORAGE_KEY = "baseballDivisionRaces.chartRange.v1";
const LIVE_STANDINGS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const NORMAL_LINE_WIDTH = 2;
const FAVORITE_LINE_WIDTH = 5;
const CHART_FONT_FAMILY = "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const VERTICAL_SCALE_OPTIONS = [1, 1.5, 2];
const MOBILE_PORTRAIT_QUERY = "(max-width: 640px) and (orientation: portrait)";

type ChartRange = "30"|"full";

interface DayStandings {
    [divisionId: string]: Array<number[]>;
}

interface LiveStandingsCache {
    fetchedAt: number;
    days: {[date: string]: DayStandings};
    eliminatedWildCardTeamNames?: string[];
}

interface LiveDayStandingsResult {
    standings: DayStandings;
    eliminatedWildCardTeamNames: string[];
}

interface PlayoffOddsTeam {
    team: string;
    abbreviation: string;
    league: "AL"|"NL";
    division: "E"|"C"|"W";
    makePlayoffs: number;
    winDivision: number;
    clinchBye: number;
    winWorldSeries: number;
}

interface PlayoffOddsSnapshot {
    source: string;
    sourceUrl: string;
    model: string;
    asOf: string;
    fetchedAt: string;
    teams: PlayoffOddsTeam[];
}

let liveRefreshCheckIntervalId: number|undefined;
let activeYearRequestId = 0;
let currentPlayoffOdds: PlayoffOddsSnapshot|undefined;
let playoffOddsByTeam = new Map<string, PlayoffOddsTeam>();

function loadTeamColorOverrides(): {[key: string]: string} {
    try {
        const savedOverrides = JSON.parse(localStorage.getItem(TEAM_COLOR_OVERRIDES_STORAGE_KEY) || "{}");
        if (savedOverrides && typeof savedOverrides === "object" && !Array.isArray(savedOverrides)) {
            return savedOverrides;
        }
    }
    catch (error) {
        console.warn("Unable to load saved team colors", error);
    }
    return {};
}

let teamColorOverrides: {[key: string]: string} = loadTeamColorOverrides();

function loadFavoriteTeam(): string {
    try {
        return localStorage.getItem(FAVORITE_TEAM_STORAGE_KEY) || "";
    }
    catch (error) {
        console.warn("Unable to load favorite team", error);
        return "";
    }
}

let favoriteTeam = loadFavoriteTeam();

function loadVerticalScale(): number {
    try {
        const savedScale = parseFloat(localStorage.getItem(VERTICAL_SCALE_STORAGE_KEY) || "1");
        return VERTICAL_SCALE_OPTIONS.indexOf(savedScale) >= 0 ? savedScale : 1;
    }
    catch (error) {
        console.warn("Unable to load vertical scale", error);
        return 1;
    }
}

let verticalScale = loadVerticalScale();

function isMobilePortrait(): boolean {
    return window.matchMedia(MOBILE_PORTRAIT_QUERY).matches;
}

function loadChartRange(): ChartRange {
    try {
        const savedRange = localStorage.getItem(CHART_RANGE_STORAGE_KEY);
        if (savedRange === "30" || savedRange === "full") {
            return savedRange;
        }
    }
    catch (error) {
        console.warn("Unable to load chart range", error);
    }
    return isMobilePortrait() ? "30" : "full";
}

let chartRange: ChartRange = loadChartRange();

function saveChartRange() {
    try {
        localStorage.setItem(CHART_RANGE_STORAGE_KEY, chartRange);
    }
    catch (error) {
        console.warn("Unable to save chart range", error);
    }
}

function saveVerticalScale() {
    try {
        localStorage.setItem(VERTICAL_SCALE_STORAGE_KEY, verticalScale.toString());
    }
    catch (error) {
        console.warn("Unable to save vertical scale", error);
    }
}

function saveFavoriteTeam() {
    try {
        if (favoriteTeam) {
            localStorage.setItem(FAVORITE_TEAM_STORAGE_KEY, favoriteTeam);
        }
        else {
            localStorage.removeItem(FAVORITE_TEAM_STORAGE_KEY);
        }
    }
    catch (error) {
        console.warn("Unable to save favorite team", error);
    }
}

function saveTeamColorOverrides() {
    try {
        localStorage.setItem(TEAM_COLOR_OVERRIDES_STORAGE_KEY, JSON.stringify(teamColorOverrides));
    }
    catch (error) {
        console.warn("Unable to save team colors", error);
    }
}

function getDefaultTeamColor(teamName: string): string {
    const teamColors = TEAM_NAMES_TO_COLORS.get(teamName);
    return (isDarkMode() ? teamColors?.dark : teamColors?.light) || "#1f77b4";
}

function getTeamColor(teamName: string): string|undefined {
    if (!useTeamColors) {
        return undefined;
    }
    const override = teamColorOverrides[teamName];
    return HEX_COLOR_PATTERN.test(override || "") ? override : getDefaultTeamColor(teamName);
}

interface RenderedChart {
    targetDiv: HTMLElement;
    plotDatas: any[];
    desktopBaseHeight: number;
    mobileBaseHeight: number;
    earliestDate: Date;
    latestDate: Date;
    playoffCutoff?: PlayoffCutoff;
    mobileLegendSwatches: Map<string, HTMLElement>;
    toolbarHideTimer?: number;
}

interface PlayoffCutoff {
    y: number;
    teamName: string;
    wins: number;
    losses: number;
}

interface RaceTableTeam {
    teamName: string;
    divisionId: string;
    divisionName: string;
    wins: number;
    losses: number;
    winningPercentage: number;
    divisionLeader: boolean;
    slot: string;
}

const CHART_ANCHOR_IDS: {[title: string]: string} = {
    "American League West": "american-league-west",
    "American League Central": "american-league-central",
    "American League East": "american-league-east",
    "American League Wild Card": "american-league-wild-card",
    "American League": "american-league",
    "National League West": "national-league-west",
    "National League Central": "national-league-central",
    "National League East": "national-league-east",
    "National League Wild Card": "national-league-wild-card",
    "National League": "national-league",
    "All MLB": "mlb"
};

let renderedCharts: RenderedChart[] = [];

function updateTeamColorInAllCharts(teamName: string, color: string) {
    for (const chart of renderedCharts) {
        const traceIndices = chart.plotDatas
            .map((data, index) => (data.meta?.teamName || data.name) === teamName ? index : -1)
            .filter(index => index >= 0);
        if (traceIndices.length > 0) {
            Plotly.restyle(chart.targetDiv, {"line.color": color}, traceIndices);
            const swatch = chart.mobileLegendSwatches.get(teamName);
            if (swatch) {
                swatch.style.backgroundColor = color;
            }
        }
    }
}

function updateTeamLineWidthInAllCharts(teamName: string, width: number) {
    if (!teamName) {
        return;
    }
    for (const chart of renderedCharts) {
        const traceIndices = chart.plotDatas
            .map((data, index) => (data.meta?.teamName || data.name) === teamName ? index : -1)
            .filter(index => index >= 0);
        if (traceIndices.length > 0) {
            Plotly.restyle(chart.targetDiv, {"line.width": width}, traceIndices);
        }
    }
}

function updateFavoriteTeamInStandingsTables() {
    const rows = document.querySelectorAll(".wild-card-standings-table tbody tr[data-team-name]") as NodeListOf<HTMLTableRowElement>;
    for (const row of Array.from(rows)) {
        row.classList.toggle("favorite-team-row", row.dataset.teamName === favoriteTeam);
    }
}

function updateAllChartHeights() {
    for (const chart of renderedCharts) {
        applyResponsiveChartLayout(chart);
    }
}

function getShortTeamName(teamName: string): string {
    const parts = teamName.split(" ");
    const finalWord = parts[parts.length - 1];
    if (["Sox", "Jays"].indexOf(finalWord) >= 0 && parts.length >= 2) {
        return parts.slice(-2).join(" ");
    }
    return finalWord;
}

function formatProbability(probability: number): string {
    return `${(probability * 100).toFixed(1)}%`;
}

function formatPlayoffProbability(probability: number): string {
    const formattedProbability = formatProbability(probability);
    if (formattedProbability === "100.0%") {
        return `${formattedProbability} ✅`;
    }
    if (formattedProbability === "0.0%") {
        return `${formattedProbability} ❌`;
    }
    return formattedProbability;
}

function getLegendTeamName(teamName: string, bold: boolean): string {
    const odds = playoffOddsByTeam.get(teamName);
    const label = odds ? `${teamName} · ${formatProbability(odds.makePlayoffs)}` : teamName;
    return bold ? `<b>${label}</b>` : label;
}

function getChartRangeLayout(chart: RenderedChart): any {
    if (chartRange === "full") {
        return {"xaxis.autorange": true};
    }
    const firstVisibleDate = new Date(chart.latestDate);
    firstVisibleDate.setDate(firstVisibleDate.getDate() - 29);
    if (firstVisibleDate < chart.earliestDate) {
        firstVisibleDate.setTime(chart.earliestDate.getTime());
    }
    return {
        "xaxis.autorange": false,
        "xaxis.range": [firstVisibleDate, chart.latestDate]
    };
}

function applyResponsiveChartLayout(chart: RenderedChart) {
    const mobile = isMobilePortrait();
    const layout: any = {
        height: (mobile ? chart.mobileBaseHeight : chart.desktopBaseHeight) * verticalScale,
        showlegend: !mobile,
        "title.font.size": mobile ? 16 : 20,
        "xaxis.nticks": mobile ? 5 : 0,
        "xaxis.tickfont.size": mobile ? 11 : 12,
        "yaxis.tickfont.size": mobile ? 11 : 12,
        "margin.l": mobile ? 42 : 80,
        "margin.r": mobile ? 8 : 80,
        "margin.t": mobile ? 72 : 100,
        "margin.b": mobile ? 54 : 80,
        ...getChartRangeLayout(chart)
    };
    if (chart.playoffCutoff) {
        layout["annotations[0].text"] = mobile
            ? `WC cutoff: ${getShortTeamName(chart.playoffCutoff.teamName)}`
            : `Current playoff cutoff: ${chart.playoffCutoff.teamName} (${chart.playoffCutoff.wins}-${chart.playoffCutoff.losses})`;
        layout["annotations[0].font.size"] = mobile ? 10 : 11;
        layout["annotations[0].hovertext"] = `Current playoff cutoff: ${chart.playoffCutoff.teamName} (${chart.playoffCutoff.wins}-${chart.playoffCutoff.losses})`;
    }
    chart.targetDiv.classList.toggle("mobile-chart", mobile);
    if (!mobile) {
        chart.targetDiv.classList.remove("mobile-toolbar-visible");
    }
    Plotly.relayout(chart.targetDiv, layout);
    Plotly.Plots.resize(chart.targetDiv);
}

function updateAllChartRanges() {
    for (const chart of renderedCharts) {
        Plotly.relayout(chart.targetDiv, getChartRangeLayout(chart));
    }
}

function setupChartRangeSelector() {
    const container = document.getElementById("chartRangeSelector");
    container.className = "chart-range-selector";

    const label = document.createElement("label");
    label.htmlFor = "chartRangeSelect";
    label.textContent = "Date Range";
    container.appendChild(label);

    const select = document.createElement("select");
    select.id = "chartRangeSelect";
    select.setAttribute("aria-label", "Chart date range");
    const options: Array<{value: ChartRange, label: string}> = [
        {value: "30", label: "Last 30 days"},
        {value: "full", label: "Full season"}
    ];
    for (const rangeOption of options) {
        const option = document.createElement("option");
        option.value = rangeOption.value;
        option.text = rangeOption.label;
        select.add(option);
    }
    select.value = chartRange;
    select.addEventListener("change", () => {
        chartRange = select.value as ChartRange;
        saveChartRange();
        updateAllChartRanges();
    });
    container.appendChild(select);
}

let chartResizeTimer: number|undefined;
function scheduleResponsiveChartUpdate() {
    if (chartResizeTimer !== undefined) {
        window.clearTimeout(chartResizeTimer);
    }
    chartResizeTimer = window.setTimeout(() => {
        for (const chart of renderedCharts) {
            applyResponsiveChartLayout(chart);
        }
    }, 120);
}

// Returns the plots in reverse order so team plots with a better record get drawn
// on top of team plots with a worse record.
// Callers must set legend.traceorder to "reversed" to reverse the order the plots
// show up in the legend.
function get_plot_datas(all_standings: Array<Array<number[]>>, team_names: string[], date_values: Date[], boldLegendTeamNames?: Set<string>) : any[] {
    let plot_datas = [];
    const division_leader_games_above_500 = get_division_leader_games_over_500(all_standings);
    for (let i = 0; i < team_names.length; ++i) {
        const team_standings = all_standings.map(x => x[i]).filter(v => v !== undefined);
        const games_above_500 = team_standings.map(x => x[0] - x[1]);
        const hover_texts = team_standings.map((x, i) => `${x[0]}-${x[1]}\n${get_games_back_string(x, division_leader_games_above_500[i])}`);
        let team_date_values = date_values.slice(0, games_above_500.length);
        plot_datas.push({
            x: team_date_values,
            y: games_above_500,
            text: hover_texts,
            hoverinfo: "text+x",
            name: getLegendTeamName(team_names[i], boldLegendTeamNames?.has(team_names[i]) || false),
            meta: {teamName: team_names[i]},
            line: {
                color: getTeamColor(team_names[i]),
                width: team_names[i] === favoriteTeam ? FAVORITE_LINE_WIDTH : NORMAL_LINE_WIDTH
            }
        });
    }
    plot_datas.sort((data1, data2) => data2.y[data2.y.length - 1] - data1.y[data1.y.length - 1]);
    plot_datas.reverse();
    return plot_datas;
}

function renderPlayoffOddsPanel(snapshot?: PlayoffOddsSnapshot) {
    const container = document.getElementById("playoffOdds");
    container.innerHTML = "";
    if (!snapshot) {
        return;
    }

    const details = document.createElement("details");
    details.className = "playoff-odds-panel";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = "FanGraphs playoff chances";
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "playoff-odds-panel__body";

    const asOfDate = new Date(`${snapshot.asOf}T12:00:00`);
    const intro = document.createElement("p");
    intro.className = "playoff-odds-panel__intro";
    intro.appendChild(document.createTextNode(
        `Daily ${snapshot.model} projections as of ${asOfDate.toLocaleDateString(undefined, {month: "long", day: "numeric", year: "numeric"})}. `
    ));
    const sourceLink = document.createElement("a");
    sourceLink.href = snapshot.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceLink.textContent = "View on FanGraphs";
    intro.appendChild(sourceLink);
    body.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "playoff-odds-grid";
    const divisions: Array<{league: "AL"|"NL", division: "E"|"C"|"W", label: string}> = [
        {league: "AL", division: "E", label: "AL East"},
        {league: "AL", division: "C", label: "AL Central"},
        {league: "AL", division: "W", label: "AL West"},
        {league: "NL", division: "E", label: "NL East"},
        {league: "NL", division: "C", label: "NL Central"},
        {league: "NL", division: "W", label: "NL West"}
    ];

    for (const division of divisions) {
        const section = document.createElement("section");
        section.className = "playoff-odds-division";
        const heading = document.createElement("h3");
        heading.textContent = division.label;
        section.appendChild(heading);

        const table = document.createElement("table");
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        for (const label of ["Team", "Playoffs", "Division"]) {
            const cell = document.createElement("th");
            cell.scope = "col";
            cell.textContent = label;
            headRow.appendChild(cell);
        }
        head.appendChild(headRow);
        table.appendChild(head);

        const tableBody = document.createElement("tbody");
        const teams = snapshot.teams
            .filter(team => team.league === division.league && team.division === division.division)
            .sort((a, b) => b.makePlayoffs - a.makePlayoffs || a.team.localeCompare(b.team));
        for (const team of teams) {
            const row = document.createElement("tr");
            if (team.team === favoriteTeam) {
                row.className = "favorite-team-row";
            }
            const name = document.createElement("th");
            name.scope = "row";
            name.textContent = getShortTeamName(team.team);
            name.title = team.team;
            row.appendChild(name);
            for (const [index, probability] of [team.makePlayoffs, team.winDivision].entries()) {
                const cell = document.createElement("td");
                cell.textContent = index === 0
                    ? formatPlayoffProbability(probability)
                    : formatProbability(probability);
                row.appendChild(cell);
            }
            tableBody.appendChild(row);
        }
        table.appendChild(tableBody);
        section.appendChild(table);
        grid.appendChild(section);
    }
    body.appendChild(grid);
    details.appendChild(body);
    container.appendChild(details);
}

async function loadPlayoffOddsSnapshot(): Promise<PlayoffOddsSnapshot|undefined> {
    try {
        const response = await fetch("data/fangraphs-playoff-odds.json", {cache: "no-store"});
        if (!response.ok) {
            throw new Error(`FanGraphs snapshot request failed with status ${response.status}`);
        }
        const snapshot = await response.json() as PlayoffOddsSnapshot;
        if (!Array.isArray(snapshot.teams) || snapshot.teams.length !== 30) {
            throw new Error("FanGraphs snapshot does not contain all 30 teams");
        }
        return snapshot;
    }
    catch (error) {
        console.warn("Unable to load FanGraphs playoff odds", error);
        return undefined;
    }
}

function setCurrentPlayoffOdds(snapshot?: PlayoffOddsSnapshot) {
    currentPlayoffOdds = snapshot;
    playoffOddsByTeam = new Map((snapshot?.teams || []).map(team => [team.team, team]));
    renderPlayoffOddsPanel(snapshot);
}

function setupFavoriteTeamSelector(teamNames: string[]) {
    const container = document.getElementById("favoriteTeamSelector");
    container.innerHTML = "";
    container.className = "favorite-team-selector";

    const label = document.createElement("label");
    label.htmlFor = "favoriteTeamSelect";
    label.textContent = "Favorite Team";
    container.appendChild(label);

    const select = document.createElement("select");
    select.id = "favoriteTeamSelect";
    select.setAttribute("aria-label", "Favorite Team");

    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.text = "None";
    select.add(noneOption);

    const sortedTeamNames = teamNames.slice().sort((a, b) => a.localeCompare(b));
    for (const teamName of sortedTeamNames) {
        const option = document.createElement("option");
        option.value = teamName;
        option.text = teamName;
        select.add(option);
    }
    select.value = sortedTeamNames.indexOf(favoriteTeam) >= 0 ? favoriteTeam : "";

    select.addEventListener("change", () => {
        const previousFavoriteTeam = favoriteTeam;
        favoriteTeam = select.value;
        saveFavoriteTeam();
        updateTeamLineWidthInAllCharts(previousFavoriteTeam, NORMAL_LINE_WIDTH);
        updateTeamLineWidthInAllCharts(favoriteTeam, FAVORITE_LINE_WIDTH);
        updateFavoriteTeamInStandingsTables();
        renderPlayoffOddsPanel(currentPlayoffOdds);
    });
    container.appendChild(select);
}

function setupVerticalScaleSelector() {
    const container = document.getElementById("verticalScaleSelector");
    container.className = "vertical-scale-selector";

    const label = document.createElement("label");
    label.htmlFor = "verticalScaleSelect";
    label.textContent = "Vertical Scale";
    container.appendChild(label);

    const select = document.createElement("select");
    select.id = "verticalScaleSelect";
    select.setAttribute("aria-label", "Vertical Scale");
    for (const scale of VERTICAL_SCALE_OPTIONS) {
        const option = document.createElement("option");
        option.value = scale.toString();
        option.text = scale.toFixed(1);
        select.add(option);
    }
    select.value = verticalScale.toString();
    select.addEventListener("change", () => {
        verticalScale = parseFloat(select.value);
        saveVerticalScale();
        updateAllChartHeights();
    });
    container.appendChild(select);
}

function setupTeamColorControls(teamNames: string[]) {
    const customizer = document.getElementById("teamColorCustomizer");
    customizer.innerHTML = "";

    const details = document.createElement("details");
    details.className = "team-color-customizer";

    const summary = document.createElement("summary");
    summary.textContent = "Customize team colors";
    details.appendChild(summary);

    const scopeMessage = document.createElement("p");
    scopeMessage.className = "team-color-scope-message";
    scopeMessage.textContent = "Changes apply to every graph.";
    details.appendChild(scopeMessage);

    if (!useTeamColors) {
        const disabledMessage = document.createElement("p");
        disabledMessage.className = "team-color-disabled-message";
        disabledMessage.textContent = "Turn on “Use team colors” to customize individual teams.";
        details.appendChild(disabledMessage);
        customizer.appendChild(details);
        return;
    }

    const controls = document.createElement("div");
    controls.className = "team-color-controls";
    const sortedTeamNames = teamNames.slice().sort((a, b) => a.localeCompare(b));

    for (const teamName of sortedTeamNames) {
        const row = document.createElement("div");
        row.className = "team-color-control";

        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "color";
        input.value = getTeamColor(teamName) || getDefaultTeamColor(teamName);
        input.dataset.teamName = teamName;
        input.setAttribute("aria-label", `Color for ${teamName}`);
        label.appendChild(input);
        label.appendChild(document.createTextNode(teamName));
        row.appendChild(label);

        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.className = "team-color-reset";
        resetButton.textContent = "Reset";
        resetButton.setAttribute("aria-label", `Reset ${teamName} color`);
        row.appendChild(resetButton);

        const updateTraceColor = (color: string) => {
            input.value = color;
            updateTeamColorInAllCharts(teamName, color);
        };

        input.addEventListener("input", () => {
            teamColorOverrides[teamName] = input.value;
            saveTeamColorOverrides();
            updateTraceColor(input.value);
        });

        resetButton.addEventListener("click", () => {
            delete teamColorOverrides[teamName];
            saveTeamColorOverrides();
            updateTraceColor(getDefaultTeamColor(teamName));
        });

        controls.appendChild(row);
    }

    details.appendChild(controls);

    const resetAllButton = document.createElement("button");
    resetAllButton.type = "button";
    resetAllButton.className = "team-color-reset-all";
    resetAllButton.textContent = "Reset all team colors";
    resetAllButton.addEventListener("click", () => {
        for (const teamName of teamNames) {
            delete teamColorOverrides[teamName];
        }
        saveTeamColorOverrides();
        const inputs = controls.querySelectorAll("input[type=color]") as NodeListOf<HTMLInputElement>;
        for (const input of Array.from(inputs)) {
            const teamName = input.dataset.teamName;
            const color = getDefaultTeamColor(teamName);
            input.value = color;
            updateTeamColorInAllCharts(teamName, color);
        }
    });
    details.appendChild(resetAllButton);
    customizer.appendChild(details);
}

function get_games_back_string(team_standing: number[], leader_games_above_500: number): string {
    if (leader_games_above_500 === undefined) {
        return "";
    }
    const games_back = leader_games_above_500 - (team_standing[0] - team_standing[1]);
    return games_back === 0 ? "-" : `${games_back/2} GB`;
}

function get_division_leader_games_over_500(all_standings: Array<Array<number[]>>): number[] {
    const day_indices = Array.from(new Array(all_standings.length).keys());
    // TODO - check max length of all standings
    const team_indices = Array.from(new Array(all_standings[0].length).keys());
    return day_indices.map(i => Math.max(...team_indices.map(t => {
        if (t < all_standings[i].length) {
            return all_standings[i][t][0] - all_standings[i][t][1];
        }
        return undefined;
    }).filter(x => x !== undefined)));
}

function get_division_name_sort_key(division_name: string): number {
    let key = 0;
    // AL before NL, then West, Central, East
    if (division_name.indexOf("National League") >= 0) {
        key += 100;
    }
    if (division_name.indexOf("Central") >= 0) {
        key += 1;
    }
    if (division_name.indexOf("East") >= 0) {
        key += 2;
    }
    return key;
}

function addChart(title: string, subtitle: string | undefined, team_names: string[], all_standings: Array<Array<number[]>>, opening_day: Date, multiyear?: boolean, playoffCutoff?: PlayoffCutoff, boldLegendTeamNames?: Set<string>): HTMLElement {
    const isDark = isDarkMode();
    const astros_standings = all_standings.map(x => x[0]);
    let date_values : Date[] = [opening_day];
    while (date_values.length < astros_standings.length) {
        date_values.push(next_day(date_values[date_values.length - 1]))
    }
    const plot_datas = get_plot_datas(all_standings, team_names, date_values, boldLegendTeamNames);
    const chartSection = document.getElementById("charts");
    let chartWrapper = document.createElement('section');
    chartWrapper.className = "chart-container";
    if (CHART_ANCHOR_IDS[title]) {
        chartWrapper.id = CHART_ANCHOR_IDS[title];
    }
    let targetDiv = document.createElement('div');
    targetDiv.className = "chart";
    chartWrapper.appendChild(targetDiv);
    const mobileLegend = document.createElement("details");
    mobileLegend.className = "mobile-chart-legend";
    mobileLegend.open = team_names.length <= 10;
    const mobileLegendSummary = document.createElement("summary");
    mobileLegendSummary.textContent = `Teams (${team_names.length})`;
    mobileLegend.appendChild(mobileLegendSummary);
    const mobileLegendList = document.createElement("div");
    mobileLegendList.className = "mobile-chart-legend__list";
    mobileLegendList.setAttribute("role", "list");
    mobileLegend.appendChild(mobileLegendList);
    chartWrapper.appendChild(mobileLegend);
    chartSection.appendChild(chartWrapper);
    const lots_of_teams = team_names.length >= 10;
    const desktopBaseHeight = lots_of_teams ? 500 : 450;
    const mobileBaseHeight = lots_of_teams ? 430 : 390;
    const mobile = isMobilePortrait();
    const mobileLegendSwatches = new Map<string, HTMLElement>();

    for (const plotData of plot_datas.slice().reverse()) {
        const teamName = plotData.meta?.teamName || plotData.name;
        const item = document.createElement("span");
        item.className = "mobile-chart-legend__item";
        item.setAttribute("role", "listitem");
        const swatch = document.createElement("span");
        swatch.className = "mobile-chart-legend__swatch";
        swatch.style.backgroundColor = plotData.line.color || "#1f77b4";
        swatch.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.innerHTML = plotData.name;
        item.appendChild(swatch);
        item.appendChild(name);
        mobileLegendList.appendChild(item);
        mobileLegendSwatches.set(teamName, swatch);
    }

    const DARK_TEXT_COLOR = "#111111";
    const LIGHT_TEXT_COLOR = "#eeeeee";
    let textColor = isDark ? LIGHT_TEXT_COLOR : DARK_TEXT_COLOR;
    let plotOptions: any = {
        font: {
            family: CHART_FONT_FAMILY,
            color: textColor
        },
        title: {
            text: title,
            font: {
                color: textColor
            }
        },
        legend: {
            font: {
                color: textColor
            },
            traceorder: "reversed"
        },
        xaxis: {
            color: textColor
        },
        yaxis: {
            color: textColor
        },
        hovermode: "x",
        paper_bgcolor: isDark ? "#262626" : "#e6e6e6",
        plot_bgcolor: isDark ? "#262626" : "#e6e6e6",
        height: (mobile ? mobileBaseHeight : desktopBaseHeight) * verticalScale,
        showlegend: !mobile,
        margin: mobile ? {l: 42, r: 8, t: 72, b: 54} : undefined
    };
    
    if (multiyear) {
        plotOptions.xaxis['tickformat'] = '%b %d';
    }
    if (subtitle) {
        plotOptions.title.text = plotOptions.title.text + `<br><sup>${subtitle}</sup>`;
    }
    if (playoffCutoff) {
        const cutoffColor = isDark ? "#f3f4f6" : "#4b5563";
        plotOptions.shapes = [{
            type: "line",
            xref: "paper",
            x0: 0,
            x1: 1,
            yref: "y",
            y0: playoffCutoff.y,
            y1: playoffCutoff.y,
            line: {
                color: cutoffColor,
                width: 2,
                dash: "dash"
            },
            layer: "above"
        }];
        plotOptions.annotations = [{
            xref: "paper",
            x: 0,
            xanchor: "left",
            xshift: 6,
            yref: "y",
            y: playoffCutoff.y,
            yshift: 12,
            text: `Current playoff cutoff: ${playoffCutoff.teamName} (${playoffCutoff.wins}-${playoffCutoff.losses})`,
            hovertext: `Current playoff cutoff: ${playoffCutoff.teamName} (${playoffCutoff.wins}-${playoffCutoff.losses})`,
            captureevents: true,
            showarrow: false,
            font: {
                family: CHART_FONT_FAMILY,
                color: textColor,
                size: 11
            },
            bgcolor: isDark ? "#262626" : "#e6e6e6",
            borderpad: 2
        }];
    }

    if (mobile && playoffCutoff) {
        plotOptions.annotations[0].text = `WC cutoff: ${getShortTeamName(playoffCutoff.teamName)}`;
        plotOptions.annotations[0].font.size = 10;
    }
    if (chartRange === "30") {
        const firstVisibleDate = new Date(date_values[date_values.length - 1]);
        firstVisibleDate.setDate(firstVisibleDate.getDate() - 29);
        if (firstVisibleDate < date_values[0]) {
            firstVisibleDate.setTime(date_values[0].getTime());
        }
        plotOptions.xaxis.autorange = false;
        plotOptions.xaxis.range = [firstVisibleDate, date_values[date_values.length - 1]];
    }
    if (mobile) {
        plotOptions.title.font.size = 16;
        plotOptions.xaxis.nticks = 5;
        plotOptions.xaxis.tickfont = {size: 11};
        plotOptions.yaxis.tickfont = {size: 11};
    }

    Plotly.newPlot(targetDiv, plot_datas, plotOptions, {responsive: true, displayModeBar: "hover"});
    const renderedChart: RenderedChart = {
        targetDiv,
        plotDatas: plot_datas,
        desktopBaseHeight,
        mobileBaseHeight,
        earliestDate: date_values[0],
        latestDate: date_values[date_values.length - 1],
        playoffCutoff,
        mobileLegendSwatches
    };
    targetDiv.addEventListener("pointerdown", () => {
        if (!isMobilePortrait()) {
            return;
        }
        targetDiv.classList.add("mobile-toolbar-visible");
        if (renderedChart.toolbarHideTimer !== undefined) {
            window.clearTimeout(renderedChart.toolbarHideTimer);
        }
        renderedChart.toolbarHideTimer = window.setTimeout(() => {
            targetDiv.classList.remove("mobile-toolbar-visible");
        }, 4500);
    });
    renderedCharts.push(renderedChart);
    return chartWrapper;
}

function addLeagueChart(raw_data: any, league_name: string|undefined, opening_day: Date) {
    const league_division_ids = Object.keys(raw_data.metadata).filter(x => league_name === undefined || raw_data.metadata[x]['name'].startsWith(league_name));
    let league_team_names : string[] = [];
    let league_all_standings : Array<Array<number[]>> = [];
    for (const league_division_id of league_division_ids) {
        league_team_names.push(...raw_data.metadata[league_division_id]['teams']);
        let day_index = 0;
        for (const day_standings of raw_data.standings.map(x => x[league_division_id])) {
            if (day_index >= league_all_standings.length) {
                league_all_standings.push([]);
            }
            league_all_standings[day_index].push(...day_standings);
            ++day_index;
        }
    }
    addChart(league_name || "All MLB", undefined, league_team_names, league_all_standings, opening_day, false);
}

function getDivisionLeaderIndex(latestStandings: Array<number[]>): number {
    let leaderIndex = 0;
    let leaderWinningPercentage = -1;
    let leaderWins = -1;
    for (let index = 0; index < latestStandings.length; ++index) {
        const wins = latestStandings[index][0];
        const losses = latestStandings[index][1];
        const gamesPlayed = wins + losses;
        const winningPercentage = gamesPlayed > 0 ? wins / gamesPlayed : 0;
        if (winningPercentage > leaderWinningPercentage ||
            (winningPercentage === leaderWinningPercentage && wins > leaderWins)) {
            leaderIndex = index;
            leaderWinningPercentage = winningPercentage;
            leaderWins = wins;
        }
    }
    return leaderIndex;
}

function compareRaceTableTeams(a: RaceTableTeam, b: RaceTableTeam): number {
    return b.winningPercentage - a.winningPercentage ||
        b.wins - a.wins ||
        a.teamName.localeCompare(b.teamName);
}

function getScheduledSeasonGames(year: number): number {
    if (year === 1995) {
        return 144;
    }
    if (year === 2020) {
        return 60;
    }
    return 162;
}

function formatRaceNumber(value: number, terminalLabel: string): string {
    return value <= 0 ? terminalLabel : value.toString();
}

function formatWildCardGamesBack(team: RaceTableTeam, cutoffTeam: RaceTableTeam|undefined): string {
    if (team.divisionLeader || !cutoffTeam) {
        return "-";
    }
    const gamesBack = ((cutoffTeam.wins - team.wins) + (team.losses - cutoffTeam.losses)) / 2;
    if (gamesBack === 0) {
        return "-";
    }
    const formattedGamesBack = Math.abs(gamesBack).toFixed(1);
    return gamesBack < 0 ? `+${formattedGamesBack}` : formattedGamesBack;
}

function appendWildCardStandingsTable(
    chartWrapper: HTMLElement,
    rawData: any,
    leagueName: string,
    leagueDivisionIds: string[],
    latestDayStandings: DayStandings,
    eliminatedWildCardTeamNames: Set<string>
) {
    let teams: RaceTableTeam[] = [];
    for (const divisionId of leagueDivisionIds) {
        const metadata = rawData.metadata[divisionId];
        const divisionTeamNames: string[] = metadata['teams'];
        const divisionLeaderIndex = getDivisionLeaderIndex(latestDayStandings[divisionId]);
        for (let teamIndex = 0; teamIndex < divisionTeamNames.length; ++teamIndex) {
            const standings = latestDayStandings[divisionId][teamIndex];
            const wins = standings[0];
            const losses = standings[1];
            teams.push({
                teamName: divisionTeamNames[teamIndex],
                divisionId,
                divisionName: metadata['name'].replace(`${leagueName} `, ""),
                wins,
                losses,
                winningPercentage: wins + losses > 0 ? wins / (wins + losses) : 0,
                divisionLeader: teamIndex === divisionLeaderIndex,
                slot: ""
            });
        }
    }

    const divisionLeaders = teams.filter(team => team.divisionLeader);
    const wildCardTeams = teams.filter(team => !team.divisionLeader).sort(compareRaceTableTeams);
    wildCardTeams.slice(0, 3).forEach((team, index) => team.slot = `WC${index + 1}`);
    divisionLeaders.forEach(team => team.slot = "DIV");

    const cutoffTeam = wildCardTeams[Math.min(2, wildCardTeams.length - 1)];
    const firstTeamOut = wildCardTeams[Math.min(3, wildCardTeams.length - 1)];
    const seasonGames = getScheduledSeasonGames(getOpeningDay(rawData).getFullYear());
    const eliminationBase = seasonGames + 1;
    const tablePanel = document.createElement("section");
    tablePanel.className = "wild-card-standings";

    const heading = document.createElement("h3");
    heading.textContent = `${leagueName} postseason race standings`;
    tablePanel.appendChild(heading);

    const scrollArea = document.createElement("div");
    scrollArea.className = "wild-card-standings__scroll";
    scrollArea.tabIndex = 0;
    const table = document.createElement("table");
    table.className = "wild-card-standings-table";
    const throughDate = getLastStandingsDate(rawData).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
    const caption = document.createElement("caption");
    caption.textContent = `Standings through ${throughDate}`;
    table.appendChild(caption);

    const tableHead = document.createElement("thead");
    const headingRow = document.createElement("tr");
    for (const columnName of ["Team", "Magic", "Tragic", "Slot", "Div", "GP", "GR", "WCGB"] as string[]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = columnName;
        headingRow.appendChild(cell);
    }
    tableHead.appendChild(headingRow);
    table.appendChild(tableHead);

    const tableBody = document.createElement("tbody");
    const addGroupHeading = (label: string) => {
        const row = document.createElement("tr");
        row.className = "wild-card-standings-table__group";
        const cell = document.createElement("th");
        cell.colSpan = 8;
        cell.scope = "rowgroup";
        cell.textContent = label;
        row.appendChild(cell);
        tableBody.appendChild(row);
    };
    const addTeamRow = (team: RaceTableTeam) => {
        const row = document.createElement("tr");
        row.dataset.teamName = team.teamName;
        row.classList.toggle("favorite-team-row", team.teamName === favoriteTeam);

        const magicOpponent = team.slot ? firstTeamOut : cutoffTeam;
        const magicNumber = magicOpponent ? eliminationBase - team.wins - magicOpponent.losses : eliminationBase - team.wins;
        const tragicNumber = cutoffTeam ? eliminationBase - team.losses - cutoffTeam.wins : eliminationBase - team.losses;
        const eliminated = eliminatedWildCardTeamNames.has(team.teamName) || tragicNumber <= 0;
        const cells = [
            team.teamName,
            formatRaceNumber(magicNumber, "Clinched"),
            eliminated ? "Eliminated" : formatRaceNumber(tragicNumber, "Eliminated"),
            team.slot,
            team.divisionName,
            (team.wins + team.losses).toString(),
            Math.max(0, seasonGames - team.wins - team.losses).toString(),
            formatWildCardGamesBack(team, cutoffTeam)
        ];
        cells.forEach((value, index) => {
            const cell = document.createElement(index === 0 ? "th" : "td");
            if (index === 0) {
                (cell as HTMLTableCellElement).scope = "row";
            }
            cell.textContent = value;
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    };

    const divisionOrder: {[name: string]: number} = {East: 0, Central: 1, West: 2};
    divisionLeaders.sort((a, b) => (divisionOrder[a.divisionName] ?? 99) - (divisionOrder[b.divisionName] ?? 99));
    for (const divisionLeader of divisionLeaders) {
        addGroupHeading(divisionLeader.divisionName);
        addTeamRow(divisionLeader);
    }
    addGroupHeading("Wild Cards");
    wildCardTeams.slice(0, 3).forEach(addTeamRow);
    addGroupHeading("In the Hunt");
    wildCardTeams.slice(3).forEach(addTeamRow);

    table.appendChild(tableBody);
    scrollArea.appendChild(table);
    tablePanel.appendChild(scrollArea);

    const note = document.createElement("p");
    note.className = "wild-card-standings__note";
    note.textContent = "DIV = division leader; WC1–WC3 = Wild Card spots; GR = games remaining; WCGB = games behind the final Wild Card spot (+ means ahead). Magic and tragic numbers are record-based; MLB tiebreakers can shift them by one game.";
    tablePanel.appendChild(note);
    chartWrapper.appendChild(tablePanel);
}

function addWildCardChart(raw_data: any, leagueName: string, openingDay: Date) {
    const leagueDivisionIds = Object.keys(raw_data.metadata)
        .filter(divisionId => raw_data.metadata[divisionId]['name'].startsWith(leagueName));
    const latestDayStandings = raw_data.standings[raw_data.standings.length - 1];
    const eliminatedWildCardTeamNames = new Set<string>(raw_data.eliminatedWildCardTeamNames || []);
    let wildCardTeamNames: string[] = [];
    let wildCardStandings: Array<Array<number[]>> = raw_data.standings.map(() => []);

    for (const divisionId of leagueDivisionIds) {
        const divisionTeamNames: string[] = raw_data.metadata[divisionId]['teams'];
        const divisionLeaderIndex = getDivisionLeaderIndex(latestDayStandings[divisionId]);
        for (let teamIndex = 0; teamIndex < divisionTeamNames.length; ++teamIndex) {
            const teamName = divisionTeamNames[teamIndex];
            const hasNoFanGraphsPlayoffChance = playoffOddsByTeam.get(teamName)?.makePlayoffs === 0;
            if (teamIndex === divisionLeaderIndex ||
                eliminatedWildCardTeamNames.has(teamName) ||
                hasNoFanGraphsPlayoffChance) {
                continue;
            }
            wildCardTeamNames.push(teamName);
            for (let dayIndex = 0; dayIndex < raw_data.standings.length; ++dayIndex) {
                wildCardStandings[dayIndex].push(raw_data.standings[dayIndex][divisionId][teamIndex]);
            }
        }
    }

    const latestWildCardStandings = wildCardStandings[wildCardStandings.length - 1];
    const rankedWildCardTeams = latestWildCardStandings.map((standings, index) => {
        const wins = standings[0];
        const losses = standings[1];
        return {
            teamName: wildCardTeamNames[index],
            wins,
            losses,
            winningPercentage: wins / (wins + losses)
        };
    });
    rankedWildCardTeams.sort((a, b) =>
        b.winningPercentage - a.winningPercentage ||
        b.wins - a.wins ||
        a.teamName.localeCompare(b.teamName)
    );
    const qualifiedWildCardTeamNames = new Set(
        rankedWildCardTeams.slice(0, 3).map(team => team.teamName)
    );
    const thirdWildCardTeam = rankedWildCardTeams[2];
    const playoffCutoff: PlayoffCutoff = {
        y: thirdWildCardTeam.wins - thirdWildCardTeam.losses,
        teamName: thirdWildCardTeam.teamName,
        wins: thirdWildCardTeam.wins,
        losses: thirdWildCardTeam.losses
    };

    const chartWrapper = addChart(
        `${leagueName} Wild Card`,
        "Division leaders and teams with no playoff chance excluded",
        wildCardTeamNames,
        wildCardStandings,
        openingDay,
        false,
        playoffCutoff,
        qualifiedWildCardTeamNames
    );
    appendWildCardStandingsTable(
        chartWrapper,
        raw_data,
        leagueName,
        leagueDivisionIds,
        latestDayStandings,
        eliminatedWildCardTeamNames
    );
}

function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatApiDate(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${month}/${day}/${date.getFullYear()}`;
}

function getOpeningDay(rawData: any): Date {
    const parts: number[] = (rawData.opening_day as string).split('/').map(x => parseInt(x, 10));
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getLastStandingsDate(rawData: any): Date {
    const lastDate = getOpeningDay(rawData);
    lastDate.setDate(lastDate.getDate() + rawData.standings.length - 1);
    return lastDate;
}

function loadLiveStandingsCache(year: number): LiveStandingsCache {
    try {
        const saved = JSON.parse(localStorage.getItem(`${LIVE_STANDINGS_CACHE_KEY_PREFIX}${year}`) || "null");
        if (saved && typeof saved.fetchedAt === "number" && saved.days && typeof saved.days === "object") {
            return saved;
        }
    }
    catch (error) {
        console.warn("Unable to load cached live standings", error);
    }
    return {fetchedAt: 0, days: {}};
}

function saveLiveStandingsCache(year: number, cache: LiveStandingsCache) {
    try {
        localStorage.setItem(`${LIVE_STANDINGS_CACHE_KEY_PREFIX}${year}`, JSON.stringify(cache));
    }
    catch (error) {
        console.warn("Unable to cache live standings", error);
    }
}

function addCachedLiveStandings(rawData: any, cache: LiveStandingsCache): any {
    const result = {
        ...rawData,
        standings: rawData.standings.slice(),
        eliminatedWildCardTeamNames: cache.eliminatedWildCardTeamNames || []
    };
    let date = next_day(getLastStandingsDate(rawData));
    const today = new Date();
    while (date <= today) {
        const cachedDay = cache.days[formatLocalDate(date)];
        if (!cachedDay) {
            break;
        }
        result.standings.push(cachedDay);
        date = next_day(date);
    }
    return result;
}

async function fetchLiveDayStandings(rawData: any, date: Date): Promise<LiveDayStandingsResult> {
    const params = new URLSearchParams({
        leagueId: "103,104",
        date: formatApiDate(date),
        season: date.getFullYear().toString(),
        standingsTypes: "regularSeason",
        hydrate: "team(division)",
        fields: "records,teamRecords,team,name,division,id,wins,losses,wildCardEliminationNumber",
        _: Date.now().toString()
    });
    const response = await fetch(`https://statsapi.mlb.com/api/v1/standings?${params.toString()}`, {cache: "no-store"});
    if (!response.ok) {
        throw new Error(`MLB standings request failed with status ${response.status}`);
    }
    const apiData = await response.json();
    const teamsByDivision: {[divisionId: string]: {[teamName: string]: number[]}} = {};
    const eliminatedWildCardTeamNames: string[] = [];
    for (const recordGroup of apiData.records || []) {
        for (const teamRecord of recordGroup.teamRecords || []) {
            const divisionId = teamRecord.team.division.id.toString();
            if (!teamsByDivision[divisionId]) {
                teamsByDivision[divisionId] = {};
            }
            teamsByDivision[divisionId][teamRecord.team.name] = [teamRecord.wins, teamRecord.losses];
            if (teamRecord.wildCardEliminationNumber === "E") {
                eliminatedWildCardTeamNames.push(teamRecord.team.name);
            }
        }
    }

    const dayStandings: DayStandings = {};
    for (const divisionId of Object.keys(rawData.metadata)) {
        const divisionTeams = teamsByDivision[divisionId] || {};
        dayStandings[divisionId] = rawData.metadata[divisionId]['teams'].map((teamName: string) => {
            const standings = divisionTeams[teamName];
            if (!standings) {
                throw new Error(`MLB standings response is missing ${teamName}`);
            }
            return standings;
        });
    }
    return {standings: dayStandings, eliminatedWildCardTeamNames};
}

function updateLiveRefreshStatus(rawData: any, cache: LiveStandingsCache, prefix: string = "") {
    const status = document.getElementById("standingsRefreshStatus");
    if (!status) {
        return;
    }
    const displayedData = addCachedLiveStandings(rawData, cache);
    const throughDate = getLastStandingsDate(displayedData).toLocaleDateString(undefined, {month: "short", day: "numeric"});
    const refreshedText = cache.fetchedAt > 0
        ? ` Last checked ${new Date(cache.fetchedAt).toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"})}.`
        : "";
    status.textContent = `${prefix}Standings through ${throughDate}.${refreshedText}`;
}

async function refreshLiveStandings(rawData: any, year: number, force: boolean, requestId: number) {
    const button = document.getElementById("refreshStandingsButton") as HTMLButtonElement;
    const status = document.getElementById("standingsRefreshStatus");
    const cache = loadLiveStandingsCache(year);
    const today = new Date();
    const todayKey = formatLocalDate(today);
    const refreshIsDue = Date.now() - cache.fetchedAt >= LIVE_STANDINGS_REFRESH_INTERVAL_MS ||
        !cache.days[todayKey] || !Array.isArray(cache.eliminatedWildCardTeamNames);
    if (!force && !refreshIsDue) {
        updateLiveRefreshStatus(rawData, cache);
        return;
    }

    if (button) {
        button.disabled = true;
    }
    if (status) {
        status.textContent = "Refreshing standings from MLB…";
    }

    try {
        const firstLiveDate = next_day(getLastStandingsDate(rawData));
        let date = new Date(firstLiveDate);
        let datesToFetch: Date[] = [];
        while (date <= today) {
            const dateKey = formatLocalDate(date);
            const isToday = dateKey === todayKey;
            const isYesterday = dateKey === formatLocalDate(prev_day(today));
            if (!cache.days[dateKey] || isToday || isYesterday) {
                datesToFetch.push(new Date(date));
            }
            date = next_day(date);
        }

        for (const dateToFetch of datesToFetch) {
            const liveDay = await fetchLiveDayStandings(rawData, dateToFetch);
            cache.days[formatLocalDate(dateToFetch)] = liveDay.standings;
            cache.eliminatedWildCardTeamNames = liveDay.eliminatedWildCardTeamNames;
        }
        cache.fetchedAt = Date.now();
        saveLiveStandingsCache(year, cache);

        if (requestId !== activeYearRequestId) {
            return;
        }
        renderYearData(addCachedLiveStandings(rawData, cache));
        updateLiveRefreshStatus(rawData, cache, "Updated. ");
    }
    catch (error) {
        console.error("Unable to refresh live standings", error);
        if (status) {
            status.textContent = "Refresh failed; showing the most recent available standings.";
        }
    }
    finally {
        if (button && requestId === activeYearRequestId) {
            button.disabled = false;
        }
    }
}

function setupLiveStandingsRefresh(rawData: any, year: number, requestId: number) {
    if (liveRefreshCheckIntervalId !== undefined) {
        window.clearInterval(liveRefreshCheckIntervalId);
        liveRefreshCheckIntervalId = undefined;
    }
    const container = document.getElementById("standingsRefresh");
    container.innerHTML = "";
    if (year !== new Date().getFullYear()) {
        return;
    }

    container.className = "standings-refresh";
    const button = document.createElement("button");
    button.type = "button";
    button.id = "refreshStandingsButton";
    button.textContent = "Refresh Standings";
    button.addEventListener("click", () => refreshLiveStandings(rawData, year, true, requestId));
    container.appendChild(button);

    const status = document.createElement("span");
    status.id = "standingsRefreshStatus";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    container.appendChild(status);

    const cache = loadLiveStandingsCache(year);
    updateLiveRefreshStatus(rawData, cache);
    refreshLiveStandings(rawData, year, false, requestId);
    // Check hourly, but the cache guard permits an MLB request only after six hours.
    liveRefreshCheckIntervalId = window.setInterval(
        () => refreshLiveStandings(rawData, year, false, requestId),
        60 * 60 * 1000
    );
}

function findDivisionIdAndIndex(data: any, teamName: string): {divisionId: string, index: number} {
    for (let divisionId of Object.keys(data.metadata)) {
        let index = data.metadata[divisionId]['teams'].indexOf(teamName);
        if (index != -1) {
            return {divisionId, index};
        }
    }
    return {divisionId: "NOTFOUND", index: -1};
}

/*async function rockiesWhiteSox(data2024: any, data2025: any) {
    if (!data2024) {
        let response = await fetch(`data/2024.json`);
        data2024 = await response.json();
    }
    if (!data2025) {
        let response = await fetch(`data/2025.json`);
        data2025 = await response.json();
    }

    const opening_day_2024_str_parts : number[] = (data2024.opening_day as string).split('/').map(x => parseInt(x, 10));
    // month is 0-indexed
    let opening_day_2024 : Date = new Date(2025, opening_day_2024_str_parts[1] - 1, opening_day_2024_str_parts[2]);
    const opening_day_2025_str_parts : number[] = (data2025.opening_day as string).split('/').map(x => parseInt(x, 10));
    let opening_day_2025 : Date = new Date(2025, opening_day_2025_str_parts[1] - 1, opening_day_2025_str_parts[2]);
    let opening_day : Date = opening_day_2024 < opening_day_2025 ? opening_day_2024 : opening_day_2025;

    let whiteSoxInfo = findDivisionIdAndIndex(data2024, "Chicago White Sox");
    let whiteSoxData : Array<number[]> = data2024.standings.map(x => x[whiteSoxInfo.divisionId][whiteSoxInfo.index]);
    while (opening_day_2024 > opening_day) {
        whiteSoxData.unshift([0, 0]);
        opening_day_2024 = prev_day(opening_day_2024);
    }
    let rockiesInfo = findDivisionIdAndIndex(data2025, "Colorado Rockies");
    let rockiesData : Array<number[]> = data2025.standings.map(x => x[rockiesInfo.divisionId][rockiesInfo.index]);
    while (opening_day_2025 > opening_day) {
        rockiesData.unshift([0, 0]);
        opening_day_2025 = prev_day(opening_day_2025);
    }
    while (whiteSoxData.length < rockiesData.length) {
        whiteSoxData.push(whiteSoxData[whiteSoxData.length - 1]);
    }
    // ugh, can't use this because of how we pass in all_standings
    //let rockiesFirst;
    //{
    //    let index = rockiesData.length - 1;
    //    let rockiesAbove500 = rockiesData[index][0] - rockiesData[index][1];
    //    let whiteSoxAbove500 = whiteSoxData[index][0] - whiteSoxData[index][1];
    //    rockiesFirst = rockiesAbove500 > whiteSoxAbove500;
    //}
    // Don't pad Rockies data, they're still playing
    let all_standings = whiteSoxData.map((data, index) => {
        if (index < rockiesData.length) {
            return [data, rockiesData[index]];
        }
        return [data];
    });

    addChart("Chasing History",
         "<br>The 2024 White Sox set the record for losses in a season<br>with 121. Can the 2025 Rockies \"beat\" them?<br>",
         ["2024 White Sox", "2025 Rockies"], all_standings, opening_day, true);
}*/

function renderYearData(raw_data: any) {
    const opening_day = getOpeningDay(raw_data);
    let divisionIds = Object.keys(raw_data.metadata);
    divisionIds.sort((a, b) => get_division_name_sort_key(raw_data.metadata[a]['name']) - get_division_name_sort_key(raw_data.metadata[b]['name']));
    let have_added_all_al = false;

    document.getElementById("charts").innerHTML = '';
    renderedCharts = [];
    let teamNamesForYear: string[] = [];
    for (const divisionId of divisionIds) {
        teamNamesForYear.push(...raw_data.metadata[divisionId]['teams']);
    }
    const uniqueTeamNamesForYear = Array.from(new Set(teamNamesForYear));
    setupFavoriteTeamSelector(uniqueTeamNamesForYear);
    setupTeamColorControls(uniqueTeamNamesForYear);
    //await rockiesWhiteSox(year === "2024" ? raw_data : undefined, year === "2025" ? raw_data : undefined);

    for (const divisionId of divisionIds) {
        const team_names : string[] = raw_data.metadata[divisionId]['teams'];
        const all_standings : Array<Array<number[]>> = raw_data.standings.map(x => x[divisionId]);
        const title = raw_data.metadata[divisionId]['name'];
        if (title.startsWith("National League") && !have_added_all_al) {
            // AL is first, put all AL teams here
            have_added_all_al = true;
            addWildCardChart(raw_data, "American League", opening_day);
            addLeagueChart(raw_data, "American League", opening_day);
        }
        addChart(title, undefined, team_names, all_standings, opening_day);
    }
    addWildCardChart(raw_data, "National League", opening_day);
    addLeagueChart(raw_data, "National League", opening_day);
    // undefined = all MLB
    addLeagueChart(raw_data, undefined, opening_day);
}

async function changeYear(year: string) {
    const requestId = ++activeYearRequestId;
    if (liveRefreshCheckIntervalId !== undefined) {
        window.clearInterval(liveRefreshCheckIntervalId);
        liveRefreshCheckIntervalId = undefined;
    }
    document.getElementById("standingsRefresh").innerHTML = "";

    const numericYear = parseInt(year, 10);
    const oddsPromise = numericYear === new Date().getFullYear()
        ? loadPlayoffOddsSnapshot()
        : Promise.resolve(undefined);
    let response = await fetch(`data/${year}.json`);
    let raw_data : any = await response.json();
    const playoffOdds = await oddsPromise;
    if (requestId !== activeYearRequestId) {
        return;
    }

    setCurrentPlayoffOdds(playoffOdds);
    const cache = loadLiveStandingsCache(numericYear);
    renderYearData(numericYear === new Date().getFullYear() ? addCachedLiveStandings(raw_data, cache) : raw_data);
    setupLiveStandingsRefresh(raw_data, numericYear, requestId);
}

function isDarkMode() : boolean {
    return document.documentElement.getAttribute('color-mode') == 'dark';
}

function setupYearSelector(state: State) {
    let yearSelector = document.getElementById("yearSelect") as HTMLSelectElement;
    for (let year = MIN_YEAR; year <= MAX_YEAR; ++year) {
        let option = document.createElement("option");
        option.value = year.toString();
        option.text = year.toString();
        yearSelector.add(option);
    }
    yearSelector.addEventListener('change', (event) => {
        updateYearBasedOnSelector();
    });
    yearSelector.selectedIndex = state.year - MIN_YEAR;
    changeYear(state.year.toString());
}

function updateYearBasedOnSelector() {
    const newYear = (document.getElementById("yearSelect") as HTMLSelectElement).value;
    window.location.hash = getNewQueryHash(parseInt(newYear, 10), useTeamColors);
    changeYear(newYear);
}

let useTeamColors = true;
function setupTeamColorsCheckbox(state: State) {
    const teamColorsCheckbox = document.getElementById("useTeamColorsCheckbox") as HTMLInputElement;
    teamColorsCheckbox.checked = state.useTeamColors;
    useTeamColors = state.useTeamColors;
    // this one gets triggered if the label gets clicked
    teamColorsCheckbox.addEventListener('change', (event) => {
        useTeamColors = (document.getElementById("useTeamColorsCheckbox") as HTMLInputElement).checked;
        // sigh, if we do this immediately the slider freezes until the thread gets unblocked? anyway,
        // just delay a little
        window.setTimeout(() => updateYearBasedOnSelector(), 200);
    });
    // this one gets triggered if the toggle background gets clicked
    document.getElementById("useTeamColorsBackground").addEventListener('click', (event) => {
        let checkbox = (document.getElementById("useTeamColorsCheckbox") as HTMLInputElement);
        checkbox.checked = !checkbox.checked;
        useTeamColors = (document.getElementById("useTeamColorsCheckbox") as HTMLInputElement).checked;
        // sigh, if we do this immediately the slider freezes until the thread gets unblocked? anyway,
        // just delay a little
        window.setTimeout(() => updateYearBasedOnSelector(), 200);
    });
}


// TODO - move to different .js file?
if (window.CSS && CSS.supports("color", "var(--primary)")) {
    let toggleColorMode = function toggleColorMode(e) {
      // Switch to Light Mode
      if (e.currentTarget.classList.contains("light--hidden")) {
        // Sets the custom html attribute
        document.documentElement.setAttribute("color-mode", "light"); // Sets the user's preference in local storage
  
        localStorage.setItem("color-mode", "light");
        updateYearBasedOnSelector();
        return;
      }
      /* Switch to Dark Mode
      Sets the custom html attribute */
      document.documentElement.setAttribute("color-mode", "dark"); // Sets the user's preference in local storage
  
      localStorage.setItem("color-mode", "dark");
      updateYearBasedOnSelector();
    }; // Get the buttons in the DOM
  
    let toggleColorButtons = document.querySelectorAll(".color-mode__btn"); // Set up event listeners
  
    toggleColorButtons.forEach(function(btn) {
      btn.addEventListener("click", toggleColorMode);
    });
} else {
    // If the feature isn't supported, then we hide the toggle buttons
    //TODO - does this work?
    let btnContainer = document.querySelector(".color-mode__header") as HTMLHeadingElement;
    btnContainer.style.display = "none";
}

interface State {
    year: number,
    useTeamColors: boolean
}
function parseQueryHash(): State {
    let state : State = { year: MAX_YEAR, useTeamColors: true };
    if (!window.location.hash) {
        return state;
    }
    let hash = window.location.hash.substring(1);
    let parts = hash.split('.');
    for (let part of parts) {
        if (part.startsWith("useTeamColors=")) {
            let rest = part.substring("useTeamColors=".length);
            if (rest === '0') {
                state.useTeamColors = false;
            }
        }
        else {
            let year = parseInt(part, 10);
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
                state.year = year;
            }
        }
    }
    return state;
}
function getNewQueryHash(year: number, useTeamColors: boolean): string {
    let hash = "";
    if (year != MAX_YEAR) {
        hash += year.toString();
    }
    if (!useTeamColors) {
        if (hash.length > 0) {
            hash += '.';
        }
        hash += "useTeamColors=0";
    }
    return hash;
}


(async function() {
    let state = parseQueryHash();
    setupVerticalScaleSelector();
    setupChartRangeSelector();
    setupTeamColorsCheckbox(state);
    setupYearSelector(state);
    window.addEventListener("resize", scheduleResponsiveChartUpdate);
    window.addEventListener("orientationchange", scheduleResponsiveChartUpdate);
})();
