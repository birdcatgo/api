import axios from "axios";
import * as cheerio from "cheerio";

// OPTIONAL: Upstash Redis to remember last price (for drop arrows)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await r.json();
  return json.result ?? null;
}
async function kvSet(key, val) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

const PRODUCTS = [
  {
    key: "peteralexander_winnie_pj",
    name: "Winnie The Pooh Shortie PJ Set — Peter Alexander",
    url: "https://www.peteralexander.co.nz/shop/en/peteralexandernz/womens/womens-style/womens-pyjama-sets/winnie-the-pooh-shortie-pj-set-multi",
    parse: ($) => {
      const saleBadge = $(".product__badge--sale, .badge--sale, .sale-label").text().trim();
      const now = $(".price .now-price, .product-price .now-price, .price__current, .product__price--current").first().text();
      const was = $(".price .was-price, .product__price--was, .price__was").first().text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "pandora_rapunzel_ring",
    name: "Pandora Rapunzel Tiara Ring",
    url: "https://nz.pandora.net/en/rings/statement-rings/disney-princess-rapunzel-tiara-ring/163651C01.html",
    parse: ($) => {
      const now = $(".price .sale-price, .price .ProductPrice, [data-test='product-price']").first().text();
      const was = $(".price .was-price, .price .strike-through").first().text();
      const saleBadge = $(".badge--sale, .product-badge--sale").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "jellycat_leola_bear",
    name: "Jellycat — Leola Bear",
    url: "https://eu.jellycat.com/leola-bear/",
    parse: ($) => {
      const now = $(".product-price, .price, [itemprop='price']").first().text();
      const was = $(".product-price--was, .price--was, .was-price").first().text();
      const saleBadge = $(".sale-badge, .badge--sale").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "lilly_pulitzer_sugartown_amazon",
    name: "Lilly Pulitzer Sugartown (Amazon AU)",
    url: "https://www.amazon.com.au/Lilly-Pulitzer-Toiletry-Supplies-Toiletries/dp/B0F56DHBGL?th=1",
    parse: ($) => {
      let now = $("#corePrice_feature_div .a-price .a-offscreen").first().text();
      const deal = $("#dealprice, .priceBlockStrikePriceString").first().text();
      if (!now) now = textPriceFallback($);
      return normalizePriceResult({ now, was: deal, saleBadge: $("#dealBadge_feature_div").text() });
    },
  },
  {
    key: "kayali_vanilla_28_sephora_nz",
    name: "KAYALI Vanilla 28 — Sephora NZ (10ml)",
    url: "https://www.sephora.nz/products/kayali-vanilla-28-eau-de-parfum/v/10-ml-6291106039870",
    parse: ($) => {
      const now = $(".ProductPrice-salePrice, .ProductPrice-productPrice, [data-comp='Price ']").first().text();
      const was = $(".ProductPrice-wasPrice, .strike-through").first().text();
      const saleBadge = $("[data-comp='Badge ']").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "cheirosa_59_mecca_nz",
    name: "Sol de Janeiro — Cheirosa 59 Mist — MECCA NZ",
    url: "https://www.mecca.com/en-nz/sol-de-janeiro/cheirosa-59-perfume-mist-V-064668/",
    parse: ($) => {
      const now = $(".product-sale-price, .product-price, [data-test='product-price']").first().text();
      const was = $(".product-was-price, .strike-through").first().text();
      const saleBadge = $(".badge--sale, .badge.sale").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "sundays_in_rio_mecca_nz",
    name: "Sol de Janeiro — Sundays in Rio Mist — MECCA NZ",
    url: "https://www.mecca.com/en-nz/sol-de-janeiro/sundays-in-rio-perfume-mist-I-077578/",
    parse: ($) => {
      const now = $(".product-sale-price, .product-price, [data-test='product-price']").first().text();
      const was = $(".product-was-price, .strike-through").first().text();
      const saleBadge = $(".badge--sale, .badge.sale").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "country_road_purse",
    name: "Country Road — Branded Credit Card Purse (Cocoa)",
    url: "https://www.countryroad.co.nz/branded-credit-card-purse-60285204-238",
    parse: ($) => {
      const now = $(".product-price, .price, [itemprop='price']").first().text();
      const was = $(".product-price--was, .strike-through, .was-price").first().text();
      const saleBadge = $(".badge--sale, .sale-flag").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "lululemon_ebb_to_street_bc",
    name: "Lululemon — Ebb to Street Tank (B/C Cup)",
    url: "https://www.lululemon.co.nz/en-nz/p/ebb-to-street-tank-top-light-support%2C-b%2Fc-cup/prod2380186.html?dwvar_prod2380186_color=033454",
    parse: ($) => {
      const now = $(".price__value, [data-testid='price']").first().text();
      const was = $(".price__value--crossed, .strike-through").first().text();
      const saleBadge = $("[data-testid='price-reduced'], .markdown-badge, .sale-badge").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
  {
    key: "cottonon_sporty_off_shoulder_26",
    name: "Cotton On — Sporty Off Shoulder Tee (26 Blue/Cream)",
    url: "https://cottonon.com/NZ/the-sporty-off-shoulder-graphic-tee/2060736-01.html?dwvar_2060736-01_color=2060736-01&cgid=graphics-unisex&originalPid=2060736-01#start=16&sz=60",
    parse: ($) => {
      const now = $(".product-sale-price, .product-price, [data-test='price']").first().text();
      const was = $(".product-was-price, .strike-through, .was-price").first().text();
      const saleBadge = $(".badge--sale, .sale-badge").text();
      return normalizePriceResult({ now, was, saleBadge });
    },
  },
];

function normalizePriceResult({ now, was, saleBadge }) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const priceToNumber = (s) => {
    if (!s) return null;
    const m = s.replace(/[, ]/g, "").match(/(\d+(\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  };
  const nowTxt = norm(now);
  const wasTxt = norm(was);
  const nowNum = priceToNumber(nowTxt);
  const wasNum = priceToNumber(wasTxt);
  const onSaleMarkup =
    (!!saleBadge && saleBadge.toLowerCase().includes("sale")) ||
    (!!wasTxt && !!nowTxt && wasNum && nowNum && nowNum < wasNum);
  return { nowTxt, wasTxt, nowNum, wasNum, onSaleMarkup };
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: 20000,
  });
  return data;
}

function textPriceFallback($) {
  const body = $("body").text();
  const m = body.match(/(\$|NZ\$|A\$|€|£)\s?\d[\d,]*(\.\d{1,2})?/);
  return m ? m[0] : "";
}

export const config = { runtime: "nodejs" };

export default async function handler() {
  const results = [];
  for (const p of PRODUCTS) {
    try {
      const html = await fetchHtml(p.url);
      const $ = cheerio.load(html);
      const parsed = p.parse($);

      let dropDetected = false;
      if (parsed.nowNum != null) {
        const prevRaw = await kvGet(`price:${p.key}`);
        const prevNum = prevRaw ? Number(prevRaw) : null;
        if (prevNum != null && parsed.nowNum < prevNum) dropDetected = true;
        await kvSet(`price:${p.key}`, String(parsed.nowNum));
      }

      results.push({
        key: p.key,
        name: p.name,
        url: p.url,
        now: parsed.nowTxt || "(price not found)",
        was: parsed.wasTxt || "",
        onSaleMarkup: parsed.onSaleMarkup,
        dropDetected,
      });
    } catch (e) {
      results.push({
        key: p.key,
        name: p.name,
        url: p.url,
        error: e.message || String(e),
      });
    }
  }

  return new Response(JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
