import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

interface RateData {
  buy: number;
  sell: number;
  change: number;
  timestamp: number;
}

let cache: RateData | null = null;
const CACHE_TTL = 4000;

async function fetchSpTodayRate(): Promise<{ buy: number; sell: number; change: number }> {
  const res = await fetch("https://sp-today.com/", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ar,en-US;q=0.7,en;q=0.3",
      Connection: "keep-alive",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // sp-today.com embeds JSON inside a JS variable (double-escaped quotes).
  // Strategy: find the USD entry by its code marker, then slice that block
  // and extract damascus buy/sell from within it.

  function extractFromBlock(src: string): { buy: number; sell: number; change: number } | null {
    const buyM  = src.match(/\\"buy\\":([\d]+)/);
    const sellM = src.match(/\\"sell\\":([\d]+)/);
    const chgM  = src.match(/\\"damascus\\"[^}]+\\"change\\":([-\d.]+)/);
    if (buyM && sellM) {
      return {
        buy:    parseInt(buyM[1]),
        sell:   parseInt(sellM[1]),
        change: chgM ? parseFloat(chgM[1]) : 0,
      };
    }
    return null;
  }

  // Try 1: double-escaped JSON block starting at "code":"USD"
  const escMarker = '\\"code\\":\\"USD\\"';
  const escIdx = html.indexOf(escMarker);
  if (escIdx >= 0) {
    const block = html.slice(escIdx, escIdx + 1200);
    const r = extractFromBlock(block);
    if (r) return r;
  }

  // Try 2: unescaped JSON (e.g. <script type="application/json">)
  const unescMatch = html.match(
    /"code"\s*:\s*"USD"[^}]{0,1200}"damascus"\s*:\s*\{\s*"buy"\s*:\s*(\d+)\s*,\s*"sell"\s*:\s*(\d+)\s*,\s*"change"\s*:\s*([-\d.]+)/
  );
  if (unescMatch) {
    return {
      buy:    parseInt(unescMatch[1]),
      sell:   parseInt(unescMatch[2]),
      change: parseFloat(unescMatch[3]),
    };
  }

  throw new Error("Could not parse USD rate from sp-today.com");
}

router.get("/rate", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();

    if (cache && now - cache.timestamp < CACHE_TTL) {
      res.json({
        success: true,
        buy:       cache.buy,
        sell:      cache.sell,
        change:    cache.change,
        updatedAt: new Date(cache.timestamp).toISOString(),
        cached:    true,
      });
      return;
    }

    const { buy, sell, change } = await fetchSpTodayRate();
    cache = { buy, sell, change, timestamp: now };

    res.json({
      success:   true,
      buy,
      sell,
      change,
      updatedAt: new Date(now).toISOString(),
      cached:    false,
    });
  } catch (err) {
    logger.error({ err }, "Rate fetch failed");

    if (cache) {
      res.json({
        success:   true,
        buy:       cache.buy,
        sell:      cache.sell,
        change:    cache.change,
        updatedAt: new Date(cache.timestamp).toISOString(),
        cached:    true,
        stale:     true,
      });
      return;
    }

    res.status(502).json({ success: false, error: "Failed to fetch exchange rate" });
  }
});

export default router;
