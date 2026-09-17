#!/bin/bash
# 重启演示服务。
#
# 这里踩过三次坑，都记在这，别再用「记 pid 文件 + kill」那一套：
# 1) `pgrep -f app.py` 会把发起重启的这个 shell 自己也匹配上，把自己杀掉。
# 2) `setsid ... & echo $!` 记下的是 setsid 的壳，不是真正的 python。
#    照着这个 pid 去 kill 等于杀了个空气，老进程还占着端口，新进程 bind 失败当场死，
#    而 curl 依然返回 200（应答的是老进程），脚本却报「成功」——改完代码不生效就是这么来的。
# 3) 按命令行 pgrep 也不可靠：从本目录起的进程命令行是相对路径 `python3 app.py`，
#    历史上还存在过绝对路径 `/usr/bin/python3 /full/path/app.py`，一个模式盖不全。
#
# 所以这里不认命令行、也不认 pid 文件，直接认「谁占着 8820 端口」——
# 那才是我们真正要换掉的东西。
cd "$(dirname "$0")" || exit 1
PORT=8820
APP="$PWD/app.py"

# 2026-08-27：ss 装在 /usr/sbin，某些 shell 的 PATH 里没有 sbin，直接写 `ss` 会 command not found，
# 于是 port_pid 恒空 —— 脚本以为「端口没人占」，起新进程时 bind 失败当场死，
# 而 curl 依旧 200（应答的是没被杀掉的老进程）。所以这里两条路都走：ss 找绝对路径，再拿 lsof 兜底。
SS=$(command -v ss || echo /usr/sbin/ss)
port_pid() {
  local p=""
  [ -x "$SS" ] && p=$("$SS" -lptnH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  [ -z "$p" ] && command -v lsof >/dev/null && p=$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
  echo "$p"
}

OLD=$(port_pid)
if [ -n "$OLD" ]; then
  kill "$OLD" 2>/dev/null
  for _ in $(seq 1 25); do [ -z "$(port_pid)" ] && break; sleep 0.2; done
  [ -n "$(port_pid)" ] && kill -9 "$OLD" 2>/dev/null && sleep 0.5
fi

nohup python3 "$APP" > /tmp/visaops.log 2>&1 < /dev/null &
for _ in $(seq 1 25); do [ -n "$(port_pid)" ] && break; sleep 0.2; done

NEW=$(port_pid)
echo "$NEW" > /tmp/visaops.pid
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/visaops/")
echo "old=${OLD:-none} new=${NEW:-none} http=$code"
if [ -z "$NEW" ] || [ "$code" != "200" ]; then
  echo "!! 启动失败"; tail -20 /tmp/visaops.log; exit 1
fi
if [ -n "$OLD" ] && [ "$NEW" = "$OLD" ]; then
  echo "!! 端口还是老进程占着，新代码没生效"; exit 1
fi
