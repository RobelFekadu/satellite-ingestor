export enum GameType {
  PlatinumHounds = "PlatinumHounds",
  DashingDerby = "DashingDerby"
}

export class GameData {
  eventId: string = '';
  typeValue: string = ''
}

export class SyncSatelliteGamesDto {
  raceEvents!: SatelliteRaceEvent[];

  gameType!: GameType;
}

export class SatelliteRaceEvent {
  startDateTimeAsWords!: string;
  eventId!: string;
  typeValue!: string;
  gameNumber!: number;
  trackName!: string;
  distance!: number;
  raceEntries!: SatelliteRaceEntry[];
}

export class SatelliteRaceEntry {
  entryId!: string;
  name!: string;
  rating!: number;
  runsSincePlace!: number;
  runsSinceWin!: number;
  winOdd!: number;
  placeOdd!: number;
  lastFive!: number[];
}

export class SetSatelliteGameResult {
  eventId!: string;
  date!: Date;
  result!: number[];
  gameType!: GameType;
}