const { default: axios } = require("axios");
const { pushToCricketQueue } = require("./queueController");
const cheerio = require("cheerio");
const { SelectedSeries } = require("../models");
const logger = require("../utils/logger");

module.exports.fetchAllSeries = async (req, res) => {
  try {
    const response = await axios.get("https://api.cricapi.com/v1/series", {
      params: { apikey: process.env.CRICKET_API_KEY },
    });

    const data = response.data.data;

    return res.status(200).json({ data });
  } catch (error) {
    logger.logError("Error fetching all series", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.updateSeries = async (req, res) => {
  try {
    const { series_id } = req.query;
    if (!series_id)
      return res.status(400).json({ message: "Missing Parameters!" });
    const matches = this.fetchAndScheduleMatches(series_id);

    return res.status(200).json({ matches });
  } catch (error) {
    logger.logError("Error updating series", error, {
      series_id: req.query.series_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.fetchAndScheduleMatches = async (TOURNAMENT_ID) => {
  try {
    const response = await axios.get("https://api.cricapi.com/v1/series_info", {
      params: { apikey: process.env.CRICKET_API_KEY, id: TOURNAMENT_ID },
    });
    const matches = response.data.data.matchList;

    const now = new Date();
    const today = now.toISOString().split("T")[0]; // Get today's date (YYYY-MM-DD)

    let todaysMatches = [];
    let upcomingMatches = [];

    for (const match of matches) {
      const matchTime = new Date(match.dateTimeGMT);

      if (matchTime.toISOString().split("T")[0] === today) {
        // Match is today
        todaysMatches.push(match);

        const reminderTime = matchTime.getTime() - 15 * 60 * 1000; // 15 min before match
        if (reminderTime > now.getTime()) {
          const delay = reminderTime - now.getTime();
          logger.logDebug("Scheduled live updates for match", {
            matchName: match.name,
            reminderTime: new Date(reminderTime),
          });

          // setTimeout(() => startLiveUpdates(match.id), delay);
        } else {
          logger.logDebug("Match already started or missed scheduling", {
            matchName: match.name,
          });
        }
      } else if (matchTime > now) {
        // Future match
        upcomingMatches.push(match);
      }

      //    startLiveUpdates('1f4c12c3-a844-4874-ba24-2e118e2dfd71')
    }

    // Limit upcoming matches to 10
    upcomingMatches = upcomingMatches.slice(0, 10);

    logger.logDebug("Today's matches", {
      count: todaysMatches.length,
      matches: todaysMatches.map((m) => ({
        Name: m.name,
        Time: m.dateTimeGMT,
      })),
    });

    logger.logDebug("Upcoming matches", {
      count: upcomingMatches.length,
      matches: upcomingMatches.map((m) => ({
        Name: m.name,
        Time: m.dateTimeGMT,
      })),
    });

    return { todaysMatches, upcomingMatches };
  } catch (error) {
    logger.logError("Error fetching matches", error);
  }
};

module.exports.updateUpcomingMatches = async () => {
  const url =
    "https://www.cricbuzz.com/cricket-schedule/upcoming-series/league";

  try {
    // Fetch the HTML content
    const { data } = await axios.get(url, {
      httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
    });
    const $ = cheerio.load(data);

    const matches = [];

    // Find all match containers
    $(".cb-ovr-flo.cb-col-60.cb-col.cb-mtchs-dy-vnu.cb-adjst-lst").each(
      (_, element) => {
        const match = $(element).find("a").text().trim();
        if (match) {
          matches.push(match);
        }
      }
    );

    const scrollingText = ` • ${matches.splice(0, 5).join("  •  ")} • `;
    await SelectedSeries.update(
      {
        match_list: scrollingText,
        live_match_id: "1",
      },
      {
        where: {
          series_name: "IPL",
        },
      }
    );
  } catch (err) {
    logger.logWarn("Upcoming Matches Not Available", err);
  }
};
// Global variable to store the streaming match id
global.streamingMatchId = null;

module.exports.startLiveMatchStreaming = async () => {
  try {
    logger.logInfo("Starting live match streaming");

    const interval = setInterval(async () => {
      // sendUpdate returns either a match id (when live) or false (when finished or error)
      const result = await sendUpdate();

      if (!result) {
        logger.logInfo("Match has ended. Stopping live updates");
        clearInterval(interval);
      }
    }, 20 * 1000);
  } catch (error) {
    logger.logError("Error in live match streaming", error);
  }
};

const { format, addDays, differenceInMinutes, parseISO } = require("date-fns");

function getDateFilter() {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  return `${today},${tomorrow}`;
}

async function sendUpdate() {
  try {
    const response = await axios.get(
      `${process.env.CRICKET_API_URL}/fixtures`,
      {
        params: {
          api_token: process.env.CRICKET_API_KEY,
          include: "localTeam,visitorTeam,runs",
          "filter[league_id]": 1,
          "fields[object]": "note,localTeam,visitorTeam,runs",
          "filter[season_id]": 1689,
          "filter[starts_between]": getDateFilter(),
        },
      }
    );

    const data = response.data.data;
    const now = new Date();

    let match;

    if (global.streamingMatchId) {
      match = data.find((m) => m.id === global.streamingMatchId);
    }

    if (!match) {
      match = data.find(
        (m) =>
          m.status !== "Finished" &&
          differenceInMinutes(parseISO(m.starting_at), now) <= 60
      );
    }

    if (!match) {
      logger.logDebug("No match available for broadcasting");
      return false;
    }

    // Update global streaming match ID
    global.streamingMatchId = match.id;

    const runs = match.runs;
    let homeTeam, awayTeam, homeScore, awayScore, note;

    if (!runs || runs.length === 0) {
      homeTeam = match.localteam;
      awayTeam = match.visitorteam;
      homeScore = { score: 0, wickets: 0, overs: 0 };
      awayScore = { score: 0, wickets: 0, overs: 0 };
      note = "Match not started";
    } else {
      const firstInning = runs.find((run) => run.inning === 1);
      const secondInning = runs.find((run) => run.inning === 2);

      if (!firstInning) {
        logger.logDebug("Incomplete match data (missing first inning)");
        return false;
      }

      homeTeam =
        match.localteam.id === firstInning.team_id
          ? match.localteam
          : match.visitorteam;
      awayTeam =
        match.localteam.id !== firstInning.team_id
          ? match.localteam
          : match.visitorteam;
      homeScore = firstInning || { score: 0, wickets: 0, overs: 0 };
      awayScore = secondInning || { score: 0, wickets: 0, overs: 0 };
      note = match.note;
    }

    const dataToSend = {
      inning_1: {
        id: homeTeam.id,
        name: homeTeam.name,
        code: homeTeam.code,
        image_path: homeTeam.image_path,
        score: homeScore.score,
        wickets: homeScore.wickets,
        overs: homeScore.overs,
      },
      inning_2: {
        id: awayTeam.id,
        name: awayTeam.name,
        code: awayTeam.code,
        image_path: awayTeam.image_path,
        score: awayScore.score,
        wickets: awayScore.wickets,
        overs: awayScore.overs,
      },
      note: note,
      status: match.status,
    };

    // console.log(JSON.stringify(dataToSend));
    const message = JSON.stringify(dataToSend);
    await pushToCricketQueue(message);

    // If the current match is finished, reset the streaming match ID and return false
    if (match.status === "Finished") {
      global.streamingMatchId = null;
      return false;
    }

    return true;
  } catch (error) {
    logger.logError("Error fetching match data", error);
    return false;
  }
}

// sendUpdate();

// Fetch and publish score updates, and return match id when streaming starts
// async function sendUpdate() {
//     try {
//         const response = await axios.get(`${process.env.CRICKET_API_URL}/livescores`, {
//             params: {
//                 api_token: process.env.CRICKET_API_KEY,
//                 include: "localTeam,visitorTeam,runs",
//                 "filter[league_id]": 1,
//                 "fields[object]": "note,localTeam,visitorTeam,runs",
//                 "filter[season_id]": 1689,
//             }
//         });

//         const match = response.data.data[0];
//         if (!match) {
//             console.log('❌ No match data available');
//             return false;
//         }

//         // Set global match id if not already set
//         if (!global.streamingMatchId) {
//             global.streamingMatchId = match.id;
//         }

//         const runs = match.runs;
//         let homeTeam, awayTeam, homeScore, awayScore, note;

//         if (!runs || runs.length === 0) {
//             // Match hasn't started: assign default scores
//             homeTeam = match.localteam;
//             awayTeam = match.visitorteam;
//             homeScore = { score: 0, wickets: 0, overs: 0 };
//             awayScore = { score: 0, wickets: 0, overs: 0 };
//             note = "Match not started";
//         } else {
//             // Process match data based on innings
//             const firstInning = runs.find(run => run.inning === 1);
//             const secondInning = runs.find(run => run.inning === 2);

//             if (!firstInning) {
//                 console.log('❌ Incomplete match data (missing first inning)');
//                 return false;
//             }

//             homeTeam = match.localteam.id === firstInning.team_id ? match.localteam : match.visitorteam;
//             awayTeam = match.localteam.id !== firstInning.team_id ? match.localteam : match.visitorteam;
//             homeScore = firstInning || { score: 0, wickets: 0, overs: 0 };
//             awayScore = secondInning || { score: 0, wickets: 0, overs: 0 };
//             note = match.note;
//         }

//         const dataToSend = {
//             inning_1: {
//                 id: homeTeam.id,
//                 name: homeTeam.name,
//                 code: homeTeam.code,
//                 image_path: homeTeam.image_path,
//                 score: homeScore.score,
//                 wickets: homeScore.wickets,
//                 overs: homeScore.overs
//             },
//             inning_2: {
//                 id: awayTeam.id,
//                 name: awayTeam.name,
//                 code: awayTeam.code,
//                 image_path: awayTeam.image_path,
//                 score: awayScore.score,
//                 wickets: awayScore.wickets,
//                 overs: awayScore.overs
//             },
//             note: note,
//             status: match.status
//         };

//         const message = JSON.stringify(dataToSend);
//         await pushToCricketQueue(message);

//         // When the match is finished, return false
//         if (match.status === "Finished") return false;

//         // Otherwise, return the match id (indicating the stream is live)
//         return global.streamingMatchId;
//     } catch (error) {
//         console.error('❌ Error fetching match data:', error);
//         return false;
//     }
// }

// Function to notify another API when the match ends
async function notifyMatchEnded(matchId) {
  try {
    const response = await axios.get(
      `${process.env.CRICKET_API_URL}/fixtures/${matchId}`,
      {
        params: {
          api_token: process.env.CRICKET_API_KEY,
          include: "localTeam,visitorTeam,runs",
          // "filter[league_id]": 1,
          // "fields[object]": "note,localTeam,visitorTeam,runs",
          // "filter[season_id]": 1689,
        },
      }
    );

    const match = response.data.data;
    if (!match) {
      logger.logDebug("No match data available");
      return false;
    }

    const runs = match.runs;
    let homeTeam, awayTeam, homeScore, awayScore, note;

    if (!runs || runs.length === 0) {
      // Match hasn't started: assign default scores
      homeTeam = match.localteam;
      awayTeam = match.visitorteam;
      homeScore = { score: 0, wickets: 0, overs: 0 };
      awayScore = { score: 0, wickets: 0, overs: 0 };
      note = "Match not started";
    } else {
      // Process match data based on innings
      const firstInning = runs.find((run) => run.inning === 1);
      const secondInning = runs.find((run) => run.inning === 2);

      if (!firstInning) {
        logger.logDebug("Incomplete match data (missing first inning)");
        return false;
      }

      homeTeam =
        match.localteam.id === firstInning.team_id
          ? match.localteam
          : match.visitorteam;
      awayTeam =
        match.localteam.id !== firstInning.team_id
          ? match.localteam
          : match.visitorteam;
      homeScore = firstInning || { score: 0, wickets: 0, overs: 0 };
      awayScore = secondInning || { score: 0, wickets: 0, overs: 0 };
      note = match.note;
    }

    const dataToSend = {
      inning_1: {
        id: homeTeam.id,
        name: homeTeam.name,
        code: homeTeam.code,
        image_path: homeTeam.image_path,
        score: homeScore.score,
        wickets: homeScore.wickets,
        overs: homeScore.overs,
      },
      inning_2: {
        id: awayTeam.id,
        name: awayTeam.name,
        code: awayTeam.code,
        image_path: awayTeam.image_path,
        score: awayScore.score,
        wickets: awayScore.wickets,
        overs: awayScore.overs,
      },
      note: note,
      status: match.status,
    };
    const message = JSON.stringify(dataToSend);
    await pushToCricketQueue(message);

    logger.logInfo("Notified match end", { matchId });
  } catch (error) {
    logger.logError("Error notifying match end", error, { matchId });
  }
}

// notifyMatchEnded(65546)

// module.exports.fetchAndScheduleMatches = async () => {
//   try {
//     const response = await axios.get(
//       "https://api.cricapi.com/v1/series_info",
//       {
//         params: { apikey: process.env.CRICKET_API_KEY, id: TOURNAMENT_ID },
//       }
//     );

//     const matches = response.data.data.matchList;

//     const today = new Date().toISOString().split("T")[0]; // Get today's date (YYYY-MM-DD)
//     const todaysMatches = matches.filter((match) => match.date === today);

//     for (const match of todaysMatches) {
//       const matchTime = new Date(match.dateTimeGMT).getTime();
//       const now = Date.now();
//       const reminderTime = matchTime - 15 * 60 * 1000; // 15 minutes before match starts

//       if (reminderTime > now) {
//         const delay = reminderTime - now;
//         console.log(
//           `Scheduled live updates for ${match.name} at ${new Date(
//             reminderTime
//           )}`
//         );

//         setTimeout(() => startLiveUpdates(match.id), delay);
//       } else {
//         console.log(
//           `Match ${match.name} already started or missed scheduling.`
//         );
//       }
//     }

//     console.log(matches)
//   } catch (error) {
//     console.error("Error fetching matches:", error.message);
//   }
// };

let liveMatches = {}; // Store active matches

async function getCountryFlag(countryName) {
  try {
    const response = await axios.get("https://api.cricapi.com/v1/countries", {
      params: { apikey: process.env.CRICKET_API_KEY, search: countryName },
    });
    return response.data.data[0]?.genericFlag || "";
  } catch (error) {
    logger.logError("Error fetching flag", error, { countryName });
    return "";
  }
}
async function startLiveUpdates(matchId) {
  logger.logInfo("Starting live updates for match", { matchId });

  liveMatches[matchId] = setInterval(async () => {
    try {
      const response = await axios.get(
        `https://api.cricapi.com/v1/match_info`,
        {
          params: { apikey: process.env.CRICKET_API_KEY, id: matchId },
        }
      );
      const matchData = response.data.data;

      if (matchData.matchEnded) {
        logger.logInfo("Match ended", {
          matchName: matchData.name,
          winner: matchData.matchWinner,
        });
        clearInterval(liveMatches[matchId]); // Stop polling
        delete liveMatches[matchId];
      } else {
        logger.logDebug("Live Score Update", {
          matchName: matchData.name,
          score: matchData.score,
        });
        // TODO: Send data to MQTT devices here
        const flags = await Promise.all(
          matchData.teams.map((team) => getCountryFlag(team))
        );

        pushToCricketQueue({
          ...matchData,
          teams: matchData.teams.map((team, index) => ({
            name: team,
            flag: flags[index],
          })),
        });
      }
    } catch (error) {
      logger.logError("Error fetching match details", error, { matchId });
    }
  }, 20 * 1000); // Every minute
}
