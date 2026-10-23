"use strict";

// Pure RDP launch helpers with no Electron dependency, so they can be unit
// tested in a plain Node process (see test/multi-rdp.test.js). The actual
// client-spawning logic lives in rdp.js, which imports these.

const { promises: fsP } = require("fs");
const os = require("os");
const path = require("path");

// Build the xfreerdp/xfreerdp3 argument vector. The host:port pair is whatever
// caller passes — for Cloudflare Access tunnels this is the dynamically
// allocated loopback port, so every connection targets its own local listener.
// `title` (the connection's saved name) becomes the window title via /t:.
function buildXfreeRdpArgs(host, port, username, password, binary, title) {
  const certFlag = binary === "xfreerdp" ? "/cert-ignore" : "/cert:ignore";
  const args = [`/v:${host}:${port}`, certFlag, "/dynamic-resolution", "+clipboard"];
  if (title) args.push(`/t:${title}`);
  if (username) args.push(`/u:${username}`);
  // Password passed as argument to xfreerdp — visible in process list (xfreerdp limitation).
  if (password) args.push(`/p:${password}`);
  return args;
}

// Reduce a connection name to something safe to use as a file name.
function safeFileName(name) {
  return String(name || "")
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, "")
    .trim()
    .slice(0, 80);
}

// Write a .rdp file to a temp path and return it. The filename embeds the
// connection id and a timestamp so simultaneous connections never collide, and
// `full address` carries the per-connection local port. When a title (the
// connection's saved name) is given it leads the filename, since macOS RDP
// clients label the session after the .rdp file.
async function writeTempRdpFile(connectionId, host, port, username, title) {
  const label = safeFileName(title);
  const base = label
    ? `${label} (${connectionId.slice(0, 8)}-${Date.now()})`
    : `rm-browser-${connectionId}-${Date.now()}`;
  const tmpPath = path.join(os.tmpdir(), `${base}.rdp`);
  const lines = [
    "screen mode id:i:2",
    `full address:s:${host}:${port}`,
    username ? `username:s:${username}` : null,
    "audiomode:i:0",
    "autoreconnection enabled:i:1",
    "authentication level:i:2",
    "negotiate security layer:i:1",
    "prompt for credentials:i:1",
    "enablecredsspsupport:i:1",
  ].filter(Boolean);
  // mode 0600: the .rdp file lives in the shared temp dir, so keep it
  // owner-readable only (it carries the host/username, no password).
  await fsP.writeFile(tmpPath, lines.join("\r\n") + "\r\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return tmpPath;
}

function cleanupTempRdpFile(tmpPath, delayMs = 8000) {
  setTimeout(() => fsP.unlink(tmpPath).catch(() => {}), delayMs);
}

module.exports = { buildXfreeRdpArgs, writeTempRdpFile, cleanupTempRdpFile };
