#!/usr/bin/env node
/**
 * Telegram 命令同步诊断脚本
 */

import https from "node:https";

const TELEGRAM_API_HOST = "api.telegram.org";

function checkTelegramApi() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: TELEGRAM_API_HOST,
        port: 443,
        path: "/",
        method: "GET",
        timeout: 10000,
      },
      (res) => {
        resolve({
          reachable: true,
          statusCode: res.statusCode,
          headers: res.headers,
        });
      }
    );

    req.on("error", (err) => {
      resolve({
        reachable: false,
        error: err.message,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        reachable: false,
        error: "Timeout",
      });
    });

    req.end();
  });
}

async function main() {
  console.log("🔍 Telegram 命令同步诊断\n");
  console.log("=".repeat(50));

  // 1. 检查网络连接
  console.log("\n1️⃣  检查 Telegram API 连接...");
  const apiStatus = await checkTelegramApi();

  if (apiStatus.reachable) {
    console.log("   ✅ Telegram API 可访问");
    console.log(`   Status: ${apiStatus.statusCode}`);
  } else {
    console.log("   ❌ Telegram API 无法访问");
    console.log(`   错误: ${apiStatus.error}`);
    console.log("\n   💡 可能的解决方案:");
    console.log("      - 检查网络连接");
    console.log("      - 检查是否使用了代理 (HTTP_PROXY/HTTPS_PROXY)");
    console.log("      - 检查防火墙设置");
  }

  // 2. 检查代理环境变量
  console.log("\n2️⃣  检查代理设置...");
  const proxyVars = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"];
  let hasProxy = false;
  for (const v of proxyVars) {
    if (process.env[v]) {
      console.log(`   ${v}: ${process.env[v]}`);
      hasProxy = true;
    }
  }
  if (!hasProxy) {
    console.log("   ℹ️  未配置代理");
  }

  // 3. 提供建议
  console.log("\n" + "=".repeat(50));
  console.log("\n📋 诊断建议:\n");

  if (!apiStatus.reachable) {
    console.log("🔴 严重: Telegram API 无法访问");
    console.log("   请检查网络连接和代理设置\n");
  }

  console.log("1. 网络错误是暂时的，系统会自动重试 (最多3次)");
  console.log("2. 如果错误持续，可能是:");
  console.log("   - 代理配置问题");
  console.log("   - DNS 解析问题");
  console.log("   - 防火墙阻止");
  console.log("   - Telegram API 暂时不可用\n");

  console.log("3. 命令同步失败不会影响 Bot 的核心功能");
  console.log("   只是菜单命令不会更新\n");

  console.log("4. 手动测试:");
  console.log("   curl -v https://api.telegram.org/\n");
}

main().catch(console.error);
