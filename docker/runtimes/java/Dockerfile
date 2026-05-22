# ============================================
# Java Runtime — Sandboxed Execution
# ============================================
FROM eclipse-temurin:21-jdk-alpine

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["sh", "-c", "javac Main.java && java -cp /workspace Main"]
