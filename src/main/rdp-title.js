"use strict";

// Replaces the address in an RDP client's window title with the connection's
// saved name. For Cloudflare tunnels mstsc only ever sees the per-connection
// loopback address (e.g. "127.0.0.2:51234 - Remote Desktop Connection"), which
// says nothing about which machine you are looking at.
//
// mstsc has no option to set its own title, so on Windows a hidden PowerShell
// helper watches the client process and rewrites the title of its top-level
// windows while it runs (mstsc resets the title on reconnect / fullscreen
// toggles, hence the loop). All values reach the script through environment
// variables, never through the command line, so a connection name can't
// inject anything.

const { spawn } = require("child_process");

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TdWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
"@
$target = [uint32]$env:TD_PID
$name = $env:TD_TITLE
$addrs = @($env:TD_ADDR_FULL, $env:TD_ADDR_HOST) | Where-Object { $_ }
while (Get-Process -Id $target) {
  [TdWin]::EnumWindows({
    param($h, $l)
    $p = [uint32]0
    [void][TdWin]::GetWindowThreadProcessId($h, [ref]$p)
    if ($p -eq $target -and [TdWin]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 512
      [void][TdWin]::GetWindowText($h, $sb, 512)
      $t = $sb.ToString()
      if ($t.Contains($name)) { return $true }
      foreach ($a in $addrs) {
        if ($t.Contains($a)) { [void][TdWin]::SetWindowText($h, $t.Replace($a, $name)); break }
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 700
}
`;

const ENCODED = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");

function watchWindowsRdpTitle(proc, host, port, title) {
  if (process.platform !== "win32") return;
  if (!proc || !proc.pid || !title) return;
  const helper = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", ENCODED],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        TD_PID: String(proc.pid),
        TD_TITLE: title,
        // Longest match first so "host:port" is replaced as a whole.
        TD_ADDR_FULL: `${host}:${port}`,
        TD_ADDR_HOST: host,
      },
    },
  );
  helper.on("error", () => {});
  // The helper exits on its own once mstsc is gone; this is just a safety net.
  proc.on("exit", () => setTimeout(() => helper.kill(), 1500));
}

module.exports = { watchWindowsRdpTitle };
