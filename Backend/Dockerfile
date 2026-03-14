# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy project files first for layer caching
COPY Favigon.sln .
COPY Favigon.API/Favigon.API.csproj Favigon.API/
COPY Favigon.Application/Favigon.Application.csproj Favigon.Application/
COPY Favigon.Domain/Favigon.Domain.csproj Favigon.Domain/
COPY Favigon.Infrastructure/Favigon.Infrastructure.csproj Favigon.Infrastructure/
COPY Favigon.Converter/Favigon.Converter.csproj Favigon.Converter/

RUN dotnet restore Favigon.API/Favigon.API.csproj

# Copy source and publish
COPY . .
RUN dotnet publish Favigon.API/Favigon.API.csproj \
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
ENTRYPOINT ["dotnet", "Favigon.API.dll"]
