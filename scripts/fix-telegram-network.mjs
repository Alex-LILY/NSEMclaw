#!/usr/bin/env node
/**
 * Telegram 网络问题深度诊断修复脚本
 */

import { execSync } from "node:child_process";
import https from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";

async function checkTelegramApi() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request(
      {
        hostname: "api.telegram.org",
        port: 443,
        path: "/bot123:test/getMe",
        method: "GET",
        timeout: 10000,
        // 强制使用 IPv4
        family: 4,
      },
      (res) => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          latency: Date.now() - start,
        });
      }
    );

    req.on("error", (err) => {
      resolve({
        success: false,
        error: err.message,
        code: err.code,
        latency: Date.now() - start,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        error: "Timeout",
        latency: Date.now() - start,
      });
    });

    req.end();
  });
}

async function checkTelegramApiIPv6() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request(
      {
        hostname: "api.telegram.org",
        port: 443,
        path: "/bot123:test/getMe",
        method: "GET",
        timeout: 10000,
        // 强制使用 IPv6
        family: 6,
      },
      (res) => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          latency: Date.now() - start,
        });
      }
    );

    req.on("error", (err) => {
      resolve({
        success: false,
        error: err.message,
        code: err.code,
        latency: Date.now() - start,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        error: "Timeout",
        latency: Date.now() - start,
      });
    });

    req.end();
  });
}

function readNsemclawConfig() {
  try {
    const configPath = join(homedir(), ".nsemclaw", "nsemclaw.json");
    const content = require("fs").readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

function saveNsemclawConfig(config) {
  const configPath = join(homedir(), ".nsemclaw", "nsemclaw.json");
  require("fs").writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function main() {
  console.log("🔧 Telegram 网络深度诊断修复\n");
  console.log("=".repeat(50));

  // 1. 测试 IPv4 连接
  console.log("\n1️⃣  测试 Telegram API (IPv4)...");
  const ipv4Result = await checkTelegramApi();
  if (ipv4Result.success) {
    console.log(`   ✅ IPv4 可访问 (${ipv4Result.latency}ms)`);
  } else {
    console.log(`   ❌ IPv4 失败: ${ipv4Result.error}`);
  }

  // 2. 测试 IPv6 连接
  console.log("\n2️⃣  测试 Telegram API (IPv6)...");
  const ipv6Result = await checkTelegramApiIPv6();
  if (ipv6Result.success) {
    console.log(`   ✅ IPv6 可访问 (${ipv6Result.latency}ms)`);
  } else {
    console.log(`   ❌ IPv6 失败: ${ipv6Result.error}`);
  }

  // 3. 检查当前配置
  console.log("\n3️⃣  检查当前 Telegram 配置...");
  const config = readNsemclawConfig();
  const telegramConfig = config.channels?.telegram;
  
  if (telegramConfig?.timeoutSeconds) {
    console.log(`   当前超时设置: ${telegramConfig.timeoutSeconds}秒`);
  } else {
    console.log("   当前超时设置: 默认 (无)");
  }

  // 4. 网络问题分析
  console.log("\n4️⃣  网络问题分析:");
  
  let issueFound = false;
  
  if (!ipv4Result.success && !ipv6Result.success) {
    console.log("   🔴 严重: IPv4 和 IPv6 都无法连接 Telegram API");
    console.log("   可能原因:");
    console.log("   - 网络连接问题");
    console.log("   - 防火墙阻止");
    console.log("   - DNS 解析失败");
    issueFound = true;
  } else if (!ipv4Result.success && ipv6Result.success) {
    console.log("   🟡 IPv6 可用但 IPv4 不可用");
    console.log("   建议: 优先使用 IPv6");
  } else if (ipv4Result.success && !ipv6Result.success) {
    console.log("   🟢 IPv4 可用但 IPv6 不可用");
    console.log("   这是正常的，系统会自动使用 IPv4");
  }

  if (ipv4Result.latency > 5000 || ipv6Result.latency > 5000) {
    console.log("   🟡 延迟过高 (>5秒)，可能需要增加超时时间");
    issueFound = true;
  }

  if (!issueFound && ipv4Result.success) {
    console.log("   ✅ 网络连接正常");
    console.log("   问题可能在应用层 (Bun/Node.js fetch)");
  }

  // 5. 修复建议
  console.log("\n" + "=".repeat(50));
  console.log("\n🔨 修复建议:\n");

  console.log("方案 1: 增加 Telegram 超时时间");
  console.log("   在 ~/.nsemclaw/nsemclaw.json 中添加:");
  console.log(`   "channels": {`);
  console.log(`     "telegram": {`);
  console.log(`       "timeoutSeconds": 60`);
  console.log(`     }`);
  console.log(`   }`);
  console.log();

  console.log("方案 2: 禁用 IPv6 (如果 IPv6 有问题)");
  console.log("   在启动 NSEMclaw 前设置环境变量:");
  console.log("   export NODE_OPTIONS='--dns-result-order=ipv4first'");
  console.log();

  console.log("方案 3: 使用代理 (如果需要)");
  console.log("   设置环境变量:");
  console.log("   export HTTPS_PROXY=http://proxy.example.com:8080");
  console.log();

  // 6. 自动修复选项
  if (process.argv.includes("--fix")) {
    console.log("\n🛠️  执行自动修复...\n");
    
    // 添加超时配置
    if (!config.channels) config.channels = {};
    if (!config.channels.telegram) config.channels.telegram = {};
    config.channels.telegram.timeoutSeconds = 60;
    
    saveNsemclawConfig(config);
    console.log("✅ 已添加 timeoutSeconds: 60 到配置");
    
    console.log("\n📝 请在启动 NSEMclaw 前设置环境变量:");
    console.log("   export NODE_OPTIONS='--dns-result-order=ipv4first'");
  } else {
    console.log("\n💡 使用 --fix 参数执行自动修复:");
    console.log("   node scripts/fix-telegram-network.mjs --fix");
  }
}

main().catch(console.error);
