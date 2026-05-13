const TARGET_URL = "https://mr_studio.deno.dev";

// محدودیت‌ها
const LIMITS = {
  monthlyBandwidthMB: 5000,
  requestsPerMinute: 60,
  maxRequestSizeMB: 10
};

// ذخیره آمار
let stats = {
  totalRequests: 0,
  totalBytesOut: 0,
  monthlyStart: new Date().toISOString().slice(0, 7),
  requestsLastMinute: [],
  blockedRequests: 0
};

// بررسی محدودیت دقیقه‌ای
function isRateLimited() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  stats.requestsLastMinute = stats.requestsLastMinute.filter(t => t > oneMinuteAgo);
  
  if (stats.requestsLastMinute.length >= LIMITS.requestsPerMinute) {
    return true;
  }
  
  stats.requestsLastMinute.push(now);
  return false;
}

// بررسی محدودیت حجم ماهانه
function isBandwidthExceeded(bytes) {
  const bandwidthUsedMB = stats.totalBytesOut / (1024 * 1024);
  return bandwidthUsedMB + (bytes / (1024 * 1024)) > LIMITS.monthlyBandwidthMB;
}

async function handleRequest(request) {
  stats.totalRequests++;
  
  if (isRateLimited()) {
    stats.blockedRequests++;
    return new Response("Too Many Requests - Limit: 60 per minute", { 
      status: 429,
      headers: { "Content-Type": "text/plain" }
    });
  }
  
  const url = new URL(request.url);
  
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > LIMITS.maxRequestSizeMB * 1024 * 1024) {
    stats.blockedRequests++;
    return new Response(`Request too large - Max: ${LIMITS.maxRequestSizeMB}MB`, { 
      status: 413,
      headers: { "Content-Type": "text/plain" }
    });
  }
  
  const targetUrl = TARGET_URL + url.pathname + url.search;
  
  try {
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    const response = await fetch(newRequest);
    
    const responseClone = response.clone();
    const responseSize = (await responseClone.arrayBuffer()).byteLength;
    
    if (isBandwidthExceeded(responseSize)) {
      stats.blockedRequests++;
      return new Response("Monthly bandwidth limit exceeded (5GB)", { 
        status: 429,
        headers: { "Content-Type": "text/plain" }
      });
    }
    
    stats.totalBytesOut += responseSize;
    
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-Proxy-Stats", `Requests: ${stats.totalRequests}, Bandwidth: ${Math.round(stats.totalBytesOut / (1024 * 1024))}MB`);
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
    
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { 
      status: 502,
      headers: { "Content-Type": "text/plain" }
    });
  }
}

async function handleStats(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("stats") === "true") {
    const bandwidthUsedMB = (stats.totalBytesOut / (1024 * 1024)).toFixed(2);
    const remainingMB = (LIMITS.monthlyBandwidthMB - bandwidthUsedMB).toFixed(2);
    
    return new Response(JSON.stringify({
      totalRequests: stats.totalRequests,
      blockedRequests: stats.blockedRequests,
      bandwidthUsedMB: bandwidthUsedMB,
      bandwidthRemainingMB: remainingMB,
      requestsLastMinute: stats.requestsLastMinute.length,
      limits: LIMITS
    }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
  
  return new Response("Send ?stats=true to see usage", { 
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}

async function mainHandler(request) {
  const url = new URL(request.url);
  
  if (url.pathname === "/" && url.searchParams.has("stats")) {
    return handleStats(request);
  }
  
  return handleRequest(request);
}

addEventListener("fetch", event => {
  event.respondWith(mainHandler(event.request));
});
