
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    text?: string;
    date: number;
  };
}

export interface BotInfo {
  id: number;
  first_name: string;
  username: string;
}

// Extended list of CORS proxies for better reliability
const PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://api.codetabs.com/v1/proxy?quest=",
  "https://thingproxy.freeboard.io/fetch/"
];

/**
 * Aggressively cleans a token to remove common copy-paste mistakes.
 */
export const sanitizeToken = (token: string): string => {
  if (!token) return "";
  // Remove any non-printable characters, non-ASCII, or whitespace
  let t = token.replace(/[\u0000-\u001F\u007F-\u009F\s]/g, "");
  // Remove 'bot' prefix case-insensitively
  t = t.replace(/^bot/i, "");
  // Remove any leading colons
  t = t.replace(/^:+/, "");
  return t;
};

/**
 * Adds a cache-buster and ensures the URL is clean for proxies.
 */
const getTelegramUrl = (token: string, method: string, params: Record<string, string | number> = {}) => {
  const baseUrl = `https://api.telegram.org/bot${token}/${method}`;
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => queryParams.append(k, v.toString()));
  // Cache busting is critical for some CORS proxies
  queryParams.append("_cb", Date.now().toString());
  return `${baseUrl}?${queryParams.toString()}`;
};

async function fetchViaProxy(proxyBase: string, targetUrl: string) {
  const proxiedUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
  try {
    const response = await fetch(proxiedUrl, { 
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, status: response.status, error: errorText };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Verifies token and gets bot identity.
 */
export const getBotInfo = async (token: string): Promise<BotInfo> => {
  const cleanToken = sanitizeToken(token);
  
  if (!cleanToken || !cleanToken.includes(':')) {
    throw new Error("TOKEN_INVALID: Token format error.");
  }
  
  const targetUrl = getTelegramUrl(cleanToken, "getMe");
  let lastNetworkError = "";
  
  for (const proxy of PROXIES) {
    const result = await fetchViaProxy(proxy, targetUrl);
    if (result.ok) {
      if (result.data.ok) {
        return result.data.result;
      } else {
        if (result.data.error_code === 401 || result.data.error_code === 404) {
          throw new Error("TOKEN_INVALID");
        }
        throw new Error(result.data.description || "Telegram API error");
      }
    }
    lastNetworkError = result.error || "Proxy timeout";
  }
  
  throw new Error(`CONNECTION_FAILED: ${lastNetworkError}`);
};

/**
 * Deletes any active webhooks that block polling.
 */
export const clearWebhook = async (token: string): Promise<boolean> => {
  const cleanToken = sanitizeToken(token);
  const targetUrl = getTelegramUrl(cleanToken, "deleteWebhook", { drop_pending_updates: "true" });
  
  for (const proxy of PROXIES) {
    try {
      const result = await fetchViaProxy(proxy, targetUrl);
      if (result.ok && result.data.ok) return true;
    } catch (e) { continue; }
  }
  return false;
};

export const getTelegramUpdates = async (token: string, offset: number): Promise<TelegramUpdate[]> => {
  const cleanToken = sanitizeToken(token);
  const targetUrl = getTelegramUrl(cleanToken, "getUpdates", { 
    offset, 
    timeout: 0,
    allowed_updates: JSON.stringify(["message"]) 
  });
  
  let lastErr = "";
  for (const proxy of PROXIES) {
    try {
      const result = await fetchViaProxy(proxy, targetUrl);
      if (result.ok) {
        if (result.data.ok) return result.data.result;
        if (result.data.error_code === 401 || result.data.error_code === 403 || result.data.error_code === 404) {
          throw new Error("TOKEN_INVALID");
        }
        throw new Error(result.data.description || "Telegram API Error");
      } else if (result.status === 403 || result.status === 401) {
        lastErr = "PROXY_BLOCKED";
        continue;
      }
    } catch (e: any) {
      if (e.message === "TOKEN_INVALID") throw e;
      lastErr = e.message;
    }
  }
  throw new Error(lastErr || "Connection failed");
};

export const sendTelegramMessage = async (token: string, chatId: string | number, text: string): Promise<boolean> => {
  const cleanToken = sanitizeToken(token);
  const targetUrl = getTelegramUrl(cleanToken, "sendMessage", {
    chat_id: chatId,
    text: text
  });
  for (const proxy of PROXIES) {
    try {
      const result = await fetchViaProxy(proxy, targetUrl);
      if (result.ok && result.data.ok) return true;
    } catch (e) { continue; }
  }
  return false;
};
