#!/bin/bash

# Nsemclaw UI 启动脚本
# 同时启动网关和 HTTP 服务器

set -e

NSEMCLAW_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${NSEMCLAW_PORT:-18788}"
UI_PORT="${NSEMCLAW_UI_PORT:-8080}"

echo "🚀 启动 Nsemclaw UI..."
echo ""

# 检查 dist/entry.js 是否存在
if [ ! -f "$NSEMCLAW_DIR/dist/entry.js" ]; then
    echo "❌ 错误: dist/entry.js 不存在"
    echo "请先运行: pnpm build"
    exit 1
fi

# 检查 UI 文件是否存在
if [ ! -f "$NSEMCLAW_DIR/dist/control-ui/index.html" ]; then
    echo "❌ 错误: UI 文件不存在"
    echo "请先运行: cd ui && pnpm build"
    exit 1
fi

# 启动网关 (后台)
echo "📡 启动网关 (端口: $PORT)..."
cd "$NSEMCLAW_DIR"
./nsemclaw.mjs gateway run --port "$PORT" --auth none --allow-unconfigured &
GATEWAY_PID=$!

# 等待网关启动
sleep 2

# 检查网关是否成功启动
if ! kill -0 $GATEWAY_PID 2>/dev/null; then
    echo "❌ 网关启动失败"
    exit 1
fi

echo "✅ 网关已启动 (PID: $GATEWAY_PID)"
echo ""

# 启动 HTTP 服务器提供 UI
echo "🌐 启动 UI 服务器 (端口: $UI_PORT)..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nsemclaw UI 已就绪!"
echo ""
echo "  🌐 访问地址: http://localhost:$UI_PORT"
echo "  📡 网关地址: ws://localhost:$PORT"
echo ""
echo "  按 Ctrl+C 停止服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 使用 Python 启动简单的 HTTP 服务器
cd "$NSEMCLAW_DIR/dist/control-ui"
python3 -m http.server "$UI_PORT"
