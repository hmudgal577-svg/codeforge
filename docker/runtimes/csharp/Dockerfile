FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine
RUN dotnet tool install -g dotnet-script
ENV PATH="/root/.dotnet/tools:"
RUN adduser -D -u 1000 coderunner
RUN cp -r /root/.dotnet/tools /home/coderunner/.dotnet-tools 2>/dev/null || true
RUN chown -R coderunner:coderunner /home/coderunner/.dotnet-tools 2>/dev/null || true
ENV PATH="/home/coderunner/.dotnet-tools:"
WORKDIR /workspace
USER coderunner
CMD ["dotnet-script", "code.cs"]