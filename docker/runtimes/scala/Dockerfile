FROM eclipse-temurin:21-jdk-alpine
RUN apk add --no-cache bash curl
RUN curl -sSLf https://scala-cli.virtuslab.org/get | sh 2>/dev/null || true
RUN adduser -D -u 1000 coderunner
RUN mkdir -p /build && chown coderunner:coderunner /build
WORKDIR /workspace
USER coderunner
CMD ["sh", "-c", "scala-cli run code.scala 2>/dev/null || java code.scala"]