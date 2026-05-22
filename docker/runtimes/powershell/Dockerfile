# ============================================
# PowerShell Runtime — Sandboxed Execution
# ============================================
FROM mcr.microsoft.com/powershell:7.4-alpine-3.20

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["pwsh", "code.ps1"]
