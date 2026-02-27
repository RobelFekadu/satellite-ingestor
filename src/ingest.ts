import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";
import { GameData, GameType, SatelliteRaceEntry, SatelliteRaceEvent, SetSatelliteGameResult, SyncSatelliteGamesDto } from "./game-type.enum";
import { getEventByType, getEventDetail } from "./satellite-http.service";
import moment from 'moment';

dotenv.config();

const openGameDataTypeMap: Record<GameType, GameData> = {
  [GameType.PlatinumHounds]: new GameData(),
  [GameType.DashingDerby]: new GameData(),
};

async function pushEventsByType(gameType:GameType) {
  const url = process.env.MAIN_SERVER_URL + 'game/sync-satellite-games'
  const eventByType = await getEventByType(gameType);
  if (eventByType) {
    const satelliteRaceEvents: SatelliteRaceEvent[] = [];
    for (const raceDataByType of eventByType) {

      const raceEvent = await getEventDetail(
        raceDataByType.EventId,
        raceDataByType.TypeValue,
        gameType,
      );
      if (raceEvent) {
        const satelliteRaceEvent = new SatelliteRaceEvent();
        satelliteRaceEvent.startDateTimeAsWords = raceEvent.StartDateTimeAsWords;
        satelliteRaceEvent.eventId = raceEvent.EventId;
        satelliteRaceEvent.typeValue = `${raceEvent.TypeValue}`;
        satelliteRaceEvent.gameNumber = raceEvent.Number;
        satelliteRaceEvent.trackName = raceEvent.Race.Name;
        satelliteRaceEvent.distance = raceEvent.Race.Distance;


        const now = new Date();
        const startTime = new Date(raceEvent.StartDateTimeAsWords);
        startTime.setSeconds(0);
        startTime.setMilliseconds(0);
        const endTime = new Date(startTime);
        const cycleMinute = Number(process.env[`${gameType}_GAME_CYCLE_MINUTE`]);
        startTime.setMinutes(startTime.getMinutes() - cycleMinute);
        startTime.setHours(startTime.getHours() - 3);

        if (moment(now).isAfter(startTime) && moment(now).isBefore(endTime)) {
          const gameData = new GameData()
          gameData.eventId = satelliteRaceEvent.eventId;
          gameData.typeValue = satelliteRaceEvent.typeValue;

          openGameDataTypeMap[gameType] = gameData;
        }

        let raceEntries: SatelliteRaceEntry[] = [];
        let i = 0;
        for (const participant of raceEvent.Race.Entries) {
          const raceEntry = new SatelliteRaceEntry();
          raceEntry.name = participant.Name;
          raceEntry.entryId = `${participant.Draw}`;
          raceEntry.winOdd = participant.WinOdds;
          raceEntry.placeOdd = participant.PlaceOdds;
          raceEntry.rating = participant.StarRating;
          raceEntry.runsSinceWin = participant.RacesSinceWin;
          raceEntry.runsSincePlace = participant.RacesSincePlace;
          raceEntry.lastFive = participant.Form.split(',').map(Number);

          raceEntries[i] = raceEntry;
          i++;
        }

        satelliteRaceEvent.raceEntries = raceEntries
        satelliteRaceEvents.push(satelliteRaceEvent);
      }
    }

    let payload = new SyncSatelliteGamesDto()
    payload.gameType = gameType;
    payload.raceEvents = satelliteRaceEvents;

    try {
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 15000,
        });
    } catch (error: any) {
      console.log(error.response?.data.message);
      console.log(JSON.stringify(error))
    }
  }
}

async function pushResults(gameType:GameType) {
  const url = process.env.MAIN_SERVER_URL + 'game/satellite-game-result'
  let numOfTrial = 0;
  await delay(45000);
  while (numOfTrial < 12) {
    await delay(15000);
    const gameData = openGameDataTypeMap[gameType];
    const raceEvent = await getEventDetail(gameData.eventId, gameData.typeValue, gameType);

    if (raceEvent) {
      if (!raceEvent.Race.Result) {
        numOfTrial++;
        continue;
      }
      const result = raceEvent.Race.Result.split(',').map(Number);
      const setSatelliteGameResult = new SetSatelliteGameResult()
      setSatelliteGameResult.eventId = raceEvent.EventId;
      setSatelliteGameResult.gameType = gameType;
      setSatelliteGameResult.result = result;
      setSatelliteGameResult.date = new Date(raceEvent.StartDateTimeAsWords);
      
      try {
        await axios.post(
          url,
          setSatelliteGameResult,
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: 15000,
          });
          break;
      } catch (error:any) {
        console.log(error.response?.data.message);
        console.log(JSON.stringify(error))
      }
    } else {
      numOfTrial += 4;
      console.log(`Failed fetching data for getting result--${gameData.eventId} - ${gameData.typeValue} - ${gameType}`)
    }
  }
}

function shouldRunSync(gameType: GameType): boolean {
  const cycle = parseInt(process.env[`${gameType}_GAME_CYCLE_MINUTE`] || '0');
  const delay = parseInt(process.env[`${gameType}_GAME_DELAY_MINUTE`] || '0');

  const now = new Date();  
  if ((now.getHours() * 60 + now.getMinutes() - delay + 1) % cycle == 0) {
    return true;
  }
  return false
}

function shouldRunSetResult(gameType: GameType): boolean {
  const cycle = parseInt(process.env[`${gameType}_GAME_CYCLE_MINUTE`] || '0');
  const delay = parseInt(process.env[`${gameType}_GAME_DELAY_MINUTE`] || '0');

  const now = new Date();  
  if ((now.getHours() * 60 + now.getMinutes() - delay) % cycle == 0) {
    return true;
  }
  return false
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

cron.schedule("* * * * *", async () => {
  console.log(`\n[${new Date().toISOString()}] Tick`);

  for (const gameType of Object.values(GameType)) {
    await pushEventsByType(gameType);
    try {
      if (shouldRunSync(gameType)) {
        await pushEventsByType(gameType);
      } else {
        console.log(`${gameType} skipped`);
      }

      if (shouldRunSetResult(gameType)) {
        await pushResults(gameType);
      } else {
        console.log(`${gameType} skipped for result`);
      }
    } catch (err) {
      console.error(`Error in ${gameType}:`);
    }
  }
});

console.log("Ingestor started...");