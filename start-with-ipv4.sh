#!/bin/bash
# NSEMclaw 启动脚本 - 强制使用 IPv4 优先

export NODE_OPTIONS="--dns-result-order=ipv4first"
export UV_THREADPOOL_SIZE=128

echo "🚀 启动 NSEMclaw (IPv4 优先模式)..."
echo "   NODE_OPTIONS: $NODE_OPTIONS"
echo ""

cd "$(dirname "$0")"
exec pnpm start "$@"
