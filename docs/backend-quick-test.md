# Prueba rapida de backend MVP

## 1) Variables de entorno

1. Copiar `apps/api/.env.example` a `apps/api/.env`.
2. Copiar `apps/web/.env.local.example` a `apps/web/.env.local`.

## 2) Crear usuario manager para login de prueba

Ejecutar en PostgreSQL:

INSERT INTO users (full_name, email, role)
VALUES ('Gerente Demo', 'gerente@empresa.com', 'manager')
ON CONFLICT (email) DO NOTHING;

## 3) Levantar API

PowerShell:
Set-Location apps/api
npm run start:dev

## 4) Endpoints minimos para validar

### Login
POST http://localhost:4000/api/v1/auth/login
Body:
{
  "email": "gerente@empresa.com",
  "password": "123456"
}

Guardar `accessToken` de la respuesta. Todas las rutas siguientes requieren:

Authorization: Bearer <accessToken>

## 5) Matriz de acceso por rol

- manager: acceso completo + crear usuarios
- lead: lectura de usuarios + proyectos/tareas/dashboard/reportes
- worker: lectura de proyectos/tareas/dashboard + updates/imports (solo su alcance)

Regla adicional en tareas:
- worker solo puede editar tareas donde sea el assignee actual.
- worker solo puede listar/ver tareas donde sea el assignee actual.

Regla adicional en proyectos y dashboard:
- worker solo ve proyectos donde tiene tareas asignadas.
- worker ve metricas de dashboard calculadas unicamente con sus updates/tareas.

Regla adicional en reportes CSV:
- worker puede descargar reportes, pero solo con sus tareas asignadas.

### Crear proyecto
POST http://localhost:4000/api/v1/projects
Body:
{
  "code": "PRJ-2026-001",
  "name": "Proyecto Demo",
  "status": "active"
}

### Crear tarea
POST http://localhost:4000/api/v1/tasks
Body:
{
  "projectId": "<uuid_proyecto>",
  "code": "TASK-001",
  "title": "Definir alcance",
  "status": "todo",
  "priority": "high"
}

### Importar CSV
POST http://localhost:4000/api/v1/imports/excel
Form-data: file=<archivo.csv>
Header opcional: x-user-id=<uuid_usuario>

### Ver estado de import
GET http://localhost:4000/api/v1/imports/<importId>

### Ver errores de import
GET http://localhost:4000/api/v1/imports/<importId>/errors

### Dashboard resumen
GET http://localhost:4000/api/v1/dashboard/summary

### Dashboard carga por persona
GET http://localhost:4000/api/v1/dashboard/workload

### Dashboard tendencia semanal
GET http://localhost:4000/api/v1/dashboard/trends

### Descargar reporte CSV de tareas
GET http://localhost:4000/api/v1/reports/tasks.csv
Opcionales: ?projectId=<uuid>&status=doing
