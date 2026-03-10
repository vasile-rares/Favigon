# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy project files first for layer caching
COPY Prismatic.sln .
COPY Prismatic.API/Prismatic.API.csproj Prismatic.API/
COPY Prismatic.Application/Prismatic.Application.csproj Prismatic.Application/
COPY Prismatic.Domain/Prismatic.Domain.csproj Prismatic.Domain/
COPY Prismatic.Infrastructure/Prismatic.Infrastructure.csproj Prismatic.Infrastructure/
COPY Prismatic.Converter/Prismatic.Converter.csproj Prismatic.Converter/

RUN dotnet restore Prismatic.API/Prismatic.API.csproj

# Copy source and publish
COPY . .
RUN dotnet publish Prismatic.API/Prismatic.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Prismatic.API.dll"]
