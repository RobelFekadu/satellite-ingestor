import { GameType } from "./game-type.enum"
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "puppeteer";

puppeteer.use(StealthPlugin());

let browser: Browser | null = null;
let page: Page | null = null;
let context: BrowserContext | null = null;
const cashierCount = Object.keys(process.env).filter(key => key.startsWith("USERNAME")).length;
let currentCashierId = 1;
let csrfToken: string;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

let currentCookie = process.env.SATELLITE_COOKIE_ID;

export function updateLocalCashierToken(cookie: string) {
  currentCookie = cookie;
}

export function getCashierToken() {
  return currentCookie;
}

export function getHeader(){
  return {
    "content-type": "application/json",
    "Cookie": `retailsid=${getCashierToken()};`,
    "X-Csrf-Token": csrfToken,
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  }
}

export async function initBrowser() {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled"
    ],
    protocolTimeout:60000
  });

  context = browser.defaultBrowserContext();
  page = await context.newPage();

  await page.setViewport({
    width: 1366,
    height: 768
  });

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9"
  });
}

export async function login() {
  if (!page) await initBrowser();

  const loginUrl = process.env.DOMAIN_URL + "RetailUser/Login";

  console.log("Opening login page...");

  await page!.goto(loginUrl, {
    waitUntil: "domcontentloaded"
  });

  await sleep(8000);

  const title = await page!.title();

  if (title.includes("Just a moment")) {
    console.log("Cloudflare challenge still active...");
    await sleep(5000);
  }

  await page!.waitForSelector('input[name="Username"]', {
    timeout: 30000
  });

  console.log("Typing credentials...");

  await page!.type('input[name="Username"]', process.env[`USERNAME_${currentCashierId}`]!, {
    delay: 50
  });

  await page!.type('input[name="Password"]', process.env[`PASSWORD_${currentCashierId}`]!, {
    delay: 50
  });

  console.log("Submitting login...");

  await page!.click("#submit");

  await sleep(5000);

  const cookies = await browser!.cookies();
  const retailSidCookie = cookies.find(c => c.name === "retailsid");
  if (!retailSidCookie) {
    console.log("Login failed: retailsid cookie not found");
    return null;
  }

  csrfToken = await page!.$eval('meta[name="csrf-token"]', el => el.content);
  
  console.log("Login successful. retailsid:", retailSidCookie.value);
  console.log(`csrfToken: ${csrfToken}`);

  updateLocalCashierToken(retailSidCookie.value);

  return retailSidCookie.value;
}

async function updateSessionIfExpired(response: any) {
  if (!response || (typeof response === "string" && (response.includes("Cashier Login") || response.includes("<!DOCTYPE html")))){
    const token = await login();
    if(!token){
      if(currentCashierId < cashierCount){
        currentCashierId++;
      }else if(currentCashierId == cashierCount){
        currentCashierId = 1;
      }
      return false;
    }else{
      return true;
    }
  }
  return false;
}

async function pageEvaluate(newPage: Page, url: string, payload: any){
  const headers = getHeader()

  return await Promise.race([
      newPage.evaluate(
        async ({ url, payload, headers }) => {
          const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });

          return res.text();
        },
        { url, payload, headers }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 30000)
      )
    ]);
}

async function browserPost(url: string, payload: any) {
  let newPage: Page | null = null;

  try {
    newPage = await context!.newPage();

    await newPage.goto(process.env.DOMAIN_URL!, {
      waitUntil: "networkidle2",
      timeout: 30000
    });
    let result;

    result = await pageEvaluate(newPage, url, payload);

    const sessionExpired = await updateSessionIfExpired(result);

    if (sessionExpired) {
      result = await pageEvaluate(newPage, url, payload);
    }

    return JSON.parse(result as string);
  } catch (err) {
    console.error("browserPost error:", err);
    return null;
  } finally {
    if (newPage && !newPage.isClosed()) {
      await newPage.close();
    }
  }
}

export async function getEventByType(gameType: GameType) {
  if (!page) {
    console.log('No page')
    await initBrowser();
  }

  const feedId = getFeedId(gameType);
  const url = process.env.DOMAIN_URL + "Home/GetEventsByType";

  const payload = {
    feedId,
    bettingLayoutEnumValue: "1",
    languageCode: "en",
    name: gameType.toString(),
    nextEventCount: "",
    offset: 10800,
    operatorGuid: process.env.SATELLITE_OPERATOR_GUID,
    primaryMarketClassIds: ["1", "2"],
    sessionGuid: process.env.SATELLITE_SESSION_GUID,
    userInitiated: true
  };

  const result = await browserPost(url, payload);

  if (result.HasErrorOccured === false) {
    return result.Data;
  } else {
    console.log("Error fetching events:", JSON.stringify(result));
    return null;
  }
}

export async function getEventDetail(eventId: string, typeValue: string, gameType: GameType) {
  if (!page){
    console.log('No page')
    await initBrowser();
  } 

  const feedId = getFeedId(gameType);
  const url = process.env.DOMAIN_URL + "Home/GetEventDetail";

  const payload = {
    id: `${feedId}-${typeValue}-${eventId}`,
    bettingLayoutEnumValue: "1",
    languageCode: "en",
    offset: 10800,
    operatorGuid: process.env.SATELLITE_OPERATOR_GUID,
    primaryMarketClassIds: ["1", "2"],
    userInitiated: true,
    excludePlayerDetails: true
  };

  const result = await browserPost(url, payload);

  if (result.Event && result.Event.HasErrorOccured === false) {
    return result.Event;
  } else {
    console.log("Error fetching event detail:", result);
    return null;
  }
}

function getFeedId(gameType: GameType){
    if (gameType == GameType.PlatinumHounds || gameType == GameType.DashingDerby) {
      return 12;
    }
    return -1;
}
