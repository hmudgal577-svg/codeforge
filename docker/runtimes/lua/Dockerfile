# ============================================
# Lua Runtime — Sandboxed Execution
# ============================================
FROM alpine:3.20

RUN apk add --no-cache lua5.4
RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

# Symlink lua5.4 to lua
RUN ln -sf /usr/bin/lua5.4 /usr/bin/lua

WORKDIR /workspace
USER coderunner

CMD ["lua", "code.lua"]
