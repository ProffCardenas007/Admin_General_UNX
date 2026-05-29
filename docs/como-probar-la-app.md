# Como probar la app paso a paso

## 1) Preparar base de datos

1. Crea la base de datos `sistema_mvp` en PostgreSQL.
2. Ejecuta el esquema SQL de [db/schema.sql](db/schema.sql).

Ejemplo con `psql`:

```powershell
createdb -U postgres sistema_mvp
psql -U postgres -d sistema_mvp -f db/schema.sql
```

## 2) Variables de entorno

Ya se crearon estos archivos desde los ejemplos:

- [apps/api/.env](apps/api/.env)
- [apps/web/.env.local](apps/web/.env.local)

## 3) Cargar usuario inicial para login

```sql
INSERT INTO users (full_name, email, role)
VALUES ('Gerente Demo', 'gerente@empresa.com', 'manager')
ON CONFLICT (email) DO NOTHING;
```

## 4) Levantar backend y frontend

Terminal 1:

```powershell
Set-Location apps/api
npm run start:dev
```

Terminal 2:

```powershell
Set-Location apps/web
npm run dev
```

## 5) Entrar a la app

1. Abre http://localhost:3000
2. Usa este login:

- Email: `gerente@empresa.com`
- Password: `123456`

## 6) Flujo recomendado de prueba

1. Crear proyecto (API `POST /api/v1/projects`).
2. Crear tarea (API `POST /api/v1/tasks`).
3. Subir CSV desde [templates/plantilla_reporte_trabajador.csv](templates/plantilla_reporte_trabajador.csv) con `POST /api/v1/imports/excel`.
4. Revisar dashboard en la pantalla principal (summary/workload/trends).
5. Probar descarga CSV en `GET /api/v1/reports/tasks.csv`.

## 7) Comprobacion rapida por rol

- manager: acceso completo
- lead: lectura amplia + gestion de proyectos/tareas/reportes
- worker: solo datos propios (tareas/proyectos/dashboard/reportes)

Detalles de endpoints en [docs/backend-quick-test.md](docs/backend-quick-test.md).
