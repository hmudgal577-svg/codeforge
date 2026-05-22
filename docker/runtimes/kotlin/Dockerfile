FROM eclipse-temurin:21-jdk-alpine
RUN apk add --no-cache bash wget unzip
RUN wget -q https://github.com/JetBrains/kotlin/releases/download/v2.0.21/kotlin-compiler-2.0.21.zip -O /tmp/kotlin.zip && unzip -q /tmp/kotlin.zip -d /opt && rm /tmp/kotlin.zip && ln -s /opt/kotlinc/bin/kotlinc /usr/local/bin/kotlinc && ln -s /opt/kotlinc/bin/kotlin /usr/local/bin/kotlin
RUN adduser -D -u 1000 coderunner
RUN mkdir -p /build && chown coderunner:coderunner /build
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true
WORKDIR /workspace
USER coderunner
CMD ["sh", "-c", "kotlinc code.kt -include-runtime -d /build/app.jar 2>/dev/null && java -jar /build/app.jar"]