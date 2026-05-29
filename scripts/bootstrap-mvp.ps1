param(
    [string]$RootPath = "."
)

$ErrorActionPreference = "Stop"

Write-Host "[1/7] Entrando a raiz del proyecto..."
Set-Location $RootPath

Write-Host "[2/7] Creando carpeta apps..."
New-Item -ItemType Directory -Path "apps" -Force | Out-Null
Set-Location "apps"

if (-not (Test-Path "web")) {
    Write-Host "[3/7] Creando app Next.js (web)..."
    npx --yes create-next-app@latest web --typescript --eslint --src-dir --app --import-alias "@/*" --use-npm --yes
} else {
    Write-Host "[3/7] web ya existe, se omite creacion."
}

if (-not (Test-Path "api")) {
    Write-Host "[4/7] Creando app NestJS (api)..."
    npx --yes @nestjs/cli@latest new api --package-manager npm --skip-git
} else {
    Write-Host "[4/7] api ya existe, se omite creacion."
}

Write-Host "[5/7] Instalando dependencias backend..."
Set-Location "api"
npm install @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer
npm install @nestjs/typeorm typeorm pg
npm install multer @nestjs/platform-express exceljs
npm install bullmq ioredis
npm install -D @types/passport-jwt

Write-Host "[6/7] Instalando dependencias frontend..."
Set-Location "../web"
npm install axios zod react-hook-form @hookform/resolvers
npm install recharts
npm install @tanstack/react-table

Write-Host "[7/7] Bootstrap terminado."
Write-Host "Siguiente paso: configurar .env y ejecutar db/schema.sql"
