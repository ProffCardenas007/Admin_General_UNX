# Reglas de plantilla Excel

Archivo de referencia: `templates/plantilla_reporte_trabajador.csv`

## Columnas obligatorias
- employee_email
- project_code
- task_code
- task_name
- status
- progress_percent
- worked_hours
- update_date

## Columnas opcionales
- blocker_reason
- comment

## Validaciones recomendadas
1. `employee_email`
- Debe existir en usuarios activos.

2. `project_code`
- Debe existir en proyectos activos.

3. `task_code`
- Debe existir en el proyecto indicado.
- Si permites autocreacion, exigir `task_name`.

4. `status`
- Valores permitidos: `todo`, `doing`, `blocked`, `done`.

5. `progress_percent`
- Numero entre 0 y 100.

6. `worked_hours`
- Numero mayor o igual a 0.

7. `update_date`
- Formato `YYYY-MM-DD`.
- Recomendado: no aceptar fechas futuras.

## Politica de deduplicacion
Clave unica sugerida: `task_code + employee_email + update_date`.

## Respuesta de errores
Guardar y mostrar:
- Numero de fila
- Columna
- Mensaje de error

Ejemplo:
- Fila 14, columna `progress_percent`: valor fuera de rango (0-100).
