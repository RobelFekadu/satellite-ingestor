import { GameType } from "./game-type.enum"
import axios from "axios";

let CookieRetailId = 1;

export async function getEventByType(gameType: GameType) {
  const url = process.env.DOMAIN_URL + 'Home/GetEventsByType';
  const feedId = getFeedId(gameType);

  const payload = {
    feedId: feedId,
    bettingLayoutEnumValue: '1',
    languageCode: 'en',
    name: gameType.toString(),
    nextEventCount: '',
    offset: 10800,
    operatorGuid: process.env.SATELLITE_OPERATOR_GUID,
    primaryMarketClassIds: ['1', '2'],
    sessionGuid: process.env.SATELLITE_SESSION_GUID,
    userInitiated: true,
  };

  try {
    const sourceResponse = await axios.post(
    url,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: `retailsid=${process.env[`SATELLITE_COOKIE_ID_${CookieRetailId}`]};`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    if (sourceResponse.status == 200 && sourceResponse.data.HasErrorOccured === false) {
      return sourceResponse.data.Data;
    }else{
      handleCookieExpiry(sourceResponse.data)
      return null
    }
  } catch (err) {
    console.log(JSON.stringify(err));
  }
}

export async function getEventDetail(eventId: string, typeValue: string, gameType: GameType) {
  const url = process.env.DOMAIN_URL + 'Home/GetEventDetail';
  const feedId = getFeedId(gameType);

  const payload = {
    id: `${feedId}-${typeValue}-${eventId}`,
    bettingLayoutEnumValue: '1',
    languageCode: 'en',
    offset: 10800,
    operatorGuid: process.env.SATELLITE_OPERATOR_GUID,
    primaryMarketClassIds: ['1', '2'],
    userInitiated: true,
    excludePlayerDetails: true,
  };

  try {
    const eventDetailResponse = await axios.post(
      url,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: `retailsid=${process.env[`SATELLITE_COOKIE_ID_${CookieRetailId}`]};`,
          "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      });
    if (
      eventDetailResponse.status == 200 &&
      eventDetailResponse.data.Event &&
      eventDetailResponse.data.Event.HasErrorOccured === false
    ) {
      return eventDetailResponse.data.Event;
    } else {
      handleCookieExpiry(eventDetailResponse.data);
      return null;
    }
  } catch (error) {
    console.log(JSON.stringify(error));
  }
}

function handleCookieExpiry(data: any) {
  if (data.includes('Cashier Login')) {
    console.log(`TOKEN EXPIRED: ${process.env[`SATELLITE_COOKIE_ID_${CookieRetailId}`]}`);
    updateCashierTokenToNext();
  }
}

function updateCashierTokenToNext() {
  if(CookieRetailId == 3){
    CookieRetailId = 1;
  }else{
    CookieRetailId++;
  }
}

function getFeedId(gameType: GameType){
    if (gameType == GameType.PlatinumHounds || gameType == GameType.DashingDerby) {
      return 12;
    }
    return -1;
}
