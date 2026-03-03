#!/usr/bin/env node

/**
 * Nsemclaw UI 启动脚本
 * 同时启动网关和 HTTP 服务器
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GATEWAY_PORT = process.env.NSEMCLAW_PORT || 18788;
const UI_PORT = process.env.NSEMCLAW_UI_PORT || 8080;

// MIME 类型映射
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

console.log("🚀 启动 Nsemclaw UI...\n");

// 启动网关
console.log(`📡 启动网关 (端口: ${GATEWAY_PORT})...`);
const gateway = spawn(
  "./nsemclaw.mjs",
  ["gateway", "run", "--port", String(GATEWAY_PORT), "--auth", "none", "--allow-unconfigured"],
  {
    cwd: __dirname,
    stdio: "inherit",
  }
);

// 等待网关启动
await new Promise((resolve) => setTimeout(resolve, 2000));

// 检查网关是否还在运行
if (gateway.exitCode !== null) {
  console.error("❌ 网关启动失败");
  process.exit(1);
}

console.log(`✅ 网关已启动 (PID: ${gateway.pid})\n`);

// 创建 HTTP 服务器提供 UI
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let filePath = join(__dirname, "dist", "control-ui", url.pathname);
    
    // 默认返回 index.html
    if (url.pathname === "/") {
      filePath = join(filePath, "index.html");
    }
    
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    
    res.writeHead(200, { 
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } else {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err));
    }
  }
});

server.listen(UI_PORT, () => {
  console.log("🌐 启动 UI 服务器...\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Nsemclaw UI 已就绪!");
  console.log("");
  console.log(`  🌐 访问地址: http://localhost:${UI_PORT}`);
  console.log(`  📡 网关地址: ws://localhost:${GATEWAY_PORT}`);
  console.log("");
  console.log("  按 Ctrl+C 停止服务");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// 处理退出
process.on("SIGINT", () => {
  console.log("\n🛑 正在停止服务...");
  gateway.kill("SIGTERM");
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  gateway.kill("SIGTERM");
  server.close();
});
