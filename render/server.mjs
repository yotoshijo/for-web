import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4175);
const localOrigin = "http://127.0.0.1:" + port;
const publicOrigin = new URL(process.env.RENDER_EXTERNAL_URL ?? process.env.QUOTE_PUBLIC_ORIGIN ?? localOrigin);
const upstream = new URL(process.env.QUOTE_UPSTREAM_URL ??
  "https://honeycomb-board-customer-quote.snappyowl64.chatgpt.site");
if (upstream.username || upstream.password || (process.env.RENDER && upstream.protocol !== "https:")) {
  throw new Error("Quote API origin must use HTTPS on Render and must not contain credentials.");
}
const sessionName = upstream.protocol === "https:" ? "__Host-quoteAdmin" : "quoteAdmin";
const maxBodyLength = 8192;
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const apiMethods = new Map([
  ["/api/quote", new Set(["POST"])],
  ["/api/admin/session", new Set(["GET"])],
  ["/api/admin/markup", new Set(["GET", "PUT"])],
  ["/api/admin/markup/preview", new Set(["POST"])],
  ["/api/admin/login", new Set(["POST"])],
  ["/api/admin/logout", new Set(["POST"])],
  ["/api/admin/setup", new Set(["POST"])]
]);
const assetTypes = new Map([
  ["/index.html", "text/html; charset=utf-8"],
  ["/app.js", "text/javascript; charset=utf-8"],
  ["/experience.js", "text/javascript; charset=utf-8"],
  ["/styles.css", "text/css; charset=utf-8"],
  ["/motion.css", "text/css; charset=utf-8"],
  ["/icon.svg", "image/svg+xml"],
  ["/apple-touch-icon-customer.png", "image/png"],
  ["/manifest.webmanifest", "application/manifest+json"]
]);
const assets = new Map(await Promise.all(Array.from(assetTypes.keys(), async (path) =>
  [path, await readFile(new URL("../public" + path, import.meta.url))]
)));

function reply(response, status, type, cache, body, headers = {}) {
  response.writeHead(status, {
    ...securityHeaders,
    ...headers,
    "Content-Type": type,
    "Cache-Control": cache
  });
  response.end(body);
}

function jsonError(response, status, message, headers) {
  reply(response, status, "application/json; charset=utf-8", "no-store", JSON.stringify({ message }), headers);
}

async function limitedBody(request) {
  if (Number(request.headers["content-length"]) > maxBodyLength) {
    request.resume();
    return null;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxBodyLength) {
      request.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

async function proxyApi(request, response, path) {
  const methods = apiMethods.get(path);
  if (!methods) return jsonError(response, 404, "页面不存在。");
  if (!methods.has(request.method)) {
    return jsonError(response, 405, "请求方式无效。", { Allow: [...methods].join(", ") });
  }
  const writing = request.method !== "GET";
  if (writing && request.headers.origin !== publicOrigin.origin) {
    return jsonError(response, 403, "请求来源无效。");
  }
  const headers = new Headers({ Accept: "application/json" });
  const cookies = request.headers.cookie?.split(";") ?? [];
  const session = cookies.map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(sessionName + "="));
  if (session && /^[a-f0-9]{64}$/.test(session.slice(sessionName.length + 1))) {
    headers.set("Cookie", session);
  }
  let body;
  if (writing) {
    headers.set("Origin", upstream.origin);
    const type = request.headers["content-type"];
    if (type) headers.set("Content-Type", type);
    body = await limitedBody(request);
    if (!body) return jsonError(response, 413, "请求内容过长。");
  }

  try {
    const result = await fetch(new URL(path, upstream), {
      method: request.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });
    if (!result.headers.get("content-type")?.startsWith("application/json")) {
      return jsonError(response, 503, "报价服务暂时不可用，请稍后重试。");
    }
    const setCookies = result.headers.getSetCookie().filter((cookie) =>
      cookie.startsWith(sessionName + "=") && !/;\s*domain=/i.test(cookie)
    );
    const outgoing = setCookies.length ? { "Set-Cookie": setCookies } : {};
    reply(response, result.status, "application/json; charset=utf-8", "no-store", await result.text(), outgoing);
  } catch {
    jsonError(response, 503, "报价服务暂时不可用，请稍后重试。");
  }
}

createServer(async (request, response) => {
  try {
    const path = new URL(request.url, publicOrigin).pathname;
    if (path.startsWith("/api/")) return await proxyApi(request, response, path);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(response, 405, "请求方式无效。", { Allow: "GET, HEAD" });
    }
    if (path === "/healthz") {
      return reply(response, 200, "text/plain; charset=utf-8", "no-store", request.method === "HEAD" ? undefined : "ok");
    }
    const file = path === "/" ? "/index.html" : path;
    const content = assets.get(file);
    if (!content) return jsonError(response, 404, "页面不存在。");
    reply(response, 200, assetTypes.get(file), "no-cache", request.method === "HEAD" ? undefined : content);
  } catch {
    if (!response.headersSent) jsonError(response, 500, "报价服务暂时不可用。");
    else response.destroy();
  }
}).listen(port, "0.0.0.0", () => console.log("Customer quote server listening on port " + port));
