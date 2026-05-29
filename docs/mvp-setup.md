# Arranque tecnico MVP (Next.js + NestJS + PostgreSQL)

Este documento te deja un camino directo para levantar el MVP local en Windows.

## 1. Requisitos previos

- Node.js 20 LTS
- npm 10+
- PostgreSQL 14+
- Git

## 2. Estructura objetivo

Sistema/
- db/
  - schema.sql
- docs/
  - api-contract.md
  - screen-spec.md
  - excel-rules.md
  - mvp-setup.md
- templates/
  - plantilla_reporte_trabajador.csv
- apps/
  - web/           (Next.js)
  - api/           (NestJS)

## 3. Crear apps (comandos exactos)

Desde la raiz Sistema:

1) Crear carpeta de apps

PowerShell:
New-Item -ItemType Directory -Force apps | Out-Null
Set-Location apps

2) Crear frontend Next.js

PowerShell:
npx create-next-app@latest web --typescript --eslint --src-dir --app --import-alias "@/*"

3) Crear backend NestJS

PowerShell:
npx @nestjs/cli@latest new api --package-manager npm

4) Volver a raiz

PowerShell:
Set-Location ..

## 4. Dependencias backend (apps/api)

PowerShell:
Set-Location apps/api
npm install @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer
npm install @nestjs/typeorm typeorm pg
npm install multer @nestjs/platform-express exceljs
npm install bullmq ioredis
npm install -D @types/passport-jwt

## 5. Dependencias frontend (apps/web)

PowerShell:
Set-Location ../web
npm install axios zod react-hook-form @hookform/resolvers
npm install recharts
npm install @tanstack/react-table

## 6. Variables de entorno

### Backend: apps/api/.env

PORT=4000
JWT_SECRET=change_this_secret
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sistema_mvp
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

### Frontend: apps/web/.env.local

NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1

## 7. Crear base de datos y cargar esquema

PowerShell (ejemplo con psql):
createdb -U postgres sistema_mvp
psql -U postgres -d sistema_mvp -f ../../db/schema.sql

Si no tienes psql en PATH, abre pgAdmin y ejecuta manualmente el archivo db/schema.sql.

## 8. Primeros modulos a implementar en backend

Orden recomendado (en apps/api):
1) auth
2) users
3) projects
4) tasks
5) task-updates
6) imports-excel
7) dashboard

Comandos base Nest:

nest g module auth
nest g controller auth --no-spec
nest g service auth --no-spec

nest g module users
nest g controller users --no-spec
nest g service users --no-spec

nest g module projects
nest g controller projects --no-spec
nest g service projects --no-spec

nest g module tasks
nest g controller tasks --no-spec
nest g service tasks --no-spec

nest g module task-updates
nest g controller task-updates --no-spec
nest g service task-updates --no-spec

nest g module imports
nest g controller imports --no-spec
nest g service imports --no-spec

nest g module dashboard
nest g controller dashboard --no-spec
nest g service dashboard --no-spec

## 9. Primeras pantallas frontend a implementar

Orden recomendado (apps/web/src/app):
1) login
2) dashboard
3) projects
4) tasks
5) imports
6) reports
7) admin/users

## 10. Ejecutar MVP local

### Terminal 1 (backend)
Set-Location apps/api
npm run start:dev

### Terminal 2 (frontend)
Set-Location apps/web
npm run dev

Frontend:
http://localhost:3000

Backend:
http://localhost:4000/api/v1

## 11. Criterio de "MVP listo"

- Login funcional con rol manager y worker
- CRUD de proyectos y tareas
- Registro de updates manual
- Carga CSV/Excel validada con reporte de errores por fila
- Dashboard con 5 KPIs: avance, vencidas, bloqueadas, horas, carga por persona

## 12. Siguiente nivel (fase 2)

- Integracion Metabase
- Alertas por correo o WhatsApp
- Adjuntos por tarea
- Auditoria de cambios
- SSO empresarial
