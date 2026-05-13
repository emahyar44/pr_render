// هر آدرسی که بزنی رو پروکسی کنه
async function handleRequest(request) {
  const url = new URL(request.url);
  
  // آدرس مقصد رو از پارامتر "url" میگیره
  let target = url.searchParams.get("url");
  
  if (!target) {
    return new Response("Usage: ?url=https://example.com", { status: 400 });
  }
  
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
    
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 502 });
  }
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
