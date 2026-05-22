# ============================================
# Dart Runtime — Sandboxed Execution
# ============================================
FROM dart:3.5

RUN adduser --disabled-password --gecos "" --uid 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["dart", "run", "code.dart"]
