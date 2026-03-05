import { GameType } from "./game-type.enum"
import axios from "axios";
import fs from 'fs';
import path from 'path';
import puppeteer from "puppeteer";

let lastLoginAttempt = new Date(0);
let currentCookie = process.env.SATELLITE_COOKIE_ID;

export function updateLocalCashierToken(cookie: string) {
  currentCookie = cookie;
}

export function getCashierToken() {
  return currentCookie;
}

export async function login() {
  const url = process.env.DOMAIN_URL + 'RetailUser/Login';
  const browser = await puppeteer.launch({
    headless: true, // use false if debugging
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  try {
    const page = await browser.newPage();

    // Realistic browser fingerprint
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    );

    await page.setViewport({ width: 1366, height: 768 });

    // Go to login page (not the API endpoint directly)
    await page.goto(
      url,
      { waitUntil: "networkidle2" }
    );

    // Wait for form fields (adjust selectors!)
    await page.waitForSelector('input[name="Username"]');

    // Type like a human (slight delay helps bypass bot detection)
    await page.type('input[name="Username"]', `${process.env.USERNAME}`, { delay: 50 });
    await page.type('input[name="Password"]', `${process.env.PASSWORD}`, { delay: 50 });

    // Submit and wait for redirect
    await Promise.all([
      page.click('#submit'),
      page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    // Get cookies from browser
    const cookies = await browser.cookies();

    const retailSidCookie = cookies.find(c => c.name === "retailsid");

    if (!retailSidCookie) {
      console.log("Login failed: retailsid cookie not found");
      await browser.close();
      return null;
    }

    await browser.close();
    return retailSidCookie.value;

  } catch (err) {
    console.error("Login error:", err);
    await browser.close();
    return null;
  }
}

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
        Cookie: `retailsid=${getCashierToken()};`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    if (sourceResponse.status == 200 && sourceResponse.data.HasErrorOccured === false) {
      return sourceResponse.data.Data;
    }else{
      await handleCookieExpiry(sourceResponse.data)
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
          Cookie: `retailsid=${getCashierToken()};`,
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
      await handleCookieExpiry(eventDetailResponse.data);
      return null;
    }
  } catch (error) {
    console.log(JSON.stringify(error));
  }
}

async function handleCookieExpiry(data: any) {
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (data.includes('Cashier Login') && (now.getTime() - lastLoginAttempt.getTime() > fiveMinutes)) {
    console.log(`COOKIE EXPIRED: ${getCashierToken()}`);
    const cookie = await login();
    console.log(`NEW COOKIE: ${cookie}`);
    lastLoginAttempt = now;
    updateCashierToken(cookie);
  }
}

function updateCashierToken(value: string|null|unknown) {
  const envPath = path.resolve(__dirname, '../.env');

  let envContent = fs.readFileSync(envPath, 'utf8');

  const regex = new RegExp(`^SATELLITE_COOKIE_ID=.*$`, 'm');

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `SATELLITE_COOKIE_ID=${value}`);
  } else {
    // Append if not exists
    envContent += `\nSATELLITE_COOKIE_ID=${value}`;
  }

  fs.writeFileSync(envPath, envContent);
  updateLocalCashierToken(`${value}`);
}

function getFeedId(gameType: GameType){
    if (gameType == GameType.PlatinumHounds || gameType == GameType.DashingDerby) {
      return 12;
    }
    return -1;
}
