"use strict";

// The RDP window should be labelled with the connection's saved name rather
// than the loopback address the client actually dials.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { buildXfreeRdpArgs, writeTempRdpFile } = require("../src/main/rdp-helpers");

test("buildXfreeRdpArgs sets the window title to the connection name", () => {
  const args = buildXfreeRdpArgs("127.0.0.2", 51234, "", "", "xfreerdp3", "Büro-PC");
  assert.ok(args.includes("/t:Büro-PC"));
  assert.ok(args.includes("/v:127.0.0.2:51234"));
});

test("buildXfreeRdpArgs omits /t: when no title is given", () => {
  const args = buildXfreeRdpArgs("127.0.0.2", 51234, "", "", "xfreerdp3");
  assert.ok(!args.some((a) => a.startsWith("/t:")));
});

test("writeTempRdpFile names the .rdp file after the connection", async () => {
  const p = await writeTempRdpFile("abcdef1234567890", "127.0.0.3", 40000, "", 'Server: "A"/B');
  try {
    const base = path.basename(p);
    assert.ok(base.startsWith("Server AB (abcdef12-"), base);
    assert.ok(base.endsWith(".rdp"));
    const body = await fs.readFile(p, "utf8");
    assert.match(body, /full address:s:127\.0\.0\.3:40000/);
  } finally {
    await fs.unlink(p).catch(() => {});
  }
});
