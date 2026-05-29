# Especificacion Funcional de Pantallas (MVP)

## 1) Login
Objetivo: autenticar usuarios.

Elementos:
- Campo email
- Campo password
- Boton ingresar
- Mensaje de error por credenciales

Reglas:
- Bloquear acceso tras N intentos fallidos (configurable)
- Redireccion segun rol

## 2) Dashboard Gerencial
Objetivo: vista global para toma de decisiones.

Widgets:
- Proyectos activos
- Avance global (%)
- Tareas vencidas
- Tareas bloqueadas
- Horas reportadas

Visualizaciones:
- Tendencia semanal de cierre de tareas
- Carga por equipo
- Riesgo de retraso por proyecto

Filtros:
- Rango de fechas
- Proyecto
- Equipo
- Estado

## 3) Proyectos
Objetivo: administrar cartera de proyectos.

Vista tabla:
- Codigo
- Nombre
- Cliente
- Estado
- Fecha inicio/fin
- % avance
- Tareas vencidas

Acciones:
- Crear proyecto
- Editar proyecto
- Cambiar estado
- Ver detalle

## 4) Tareas (Tabla + Kanban)
Objetivo: operar el dia a dia del trabajo.

Tabla:
- Codigo tarea
- Titulo
- Responsable
- Estado
- Prioridad
- Vencimiento
- Horas estimadas/reales

Kanban columnas:
- Todo
- Doing
- Blocked
- Done

Acciones:
- Crear tarea
- Reasignar responsable
- Cambiar estado (drag and drop)
- Registrar avance

## 5) Carga de Excel
Objetivo: ingestar avances masivamente.

Secciones:
- Descargar plantilla
- Subir archivo
- Historial de cargas
- Errores por fila/columna

Estados de importacion:
- Pending
- Processing
- Completed
- Failed

Reglas clave:
- Validar columnas obligatorias
- Mostrar errores accionables
- No insertar filas invalidas

## 6) Detalle de Tarea
Objetivo: seguimiento de una tarea especifica.

Contenido:
- Informacion general
- Historial de actualizaciones
- Bloqueadores
- Comentarios

Acciones:
- Agregar update manual
- Adjuntar evidencia (fase 2)

## 7) Reportes
Objetivo: explotar informacion para gestion.

Reportes minimos:
- Productividad por trabajador
- Avance por proyecto
- Horas reales vs estimadas
- Incidencias de bloqueo

Exportacion:
- CSV
- XLSX (fase 2)

## 8) Administracion
Objetivo: configurar el sistema.

Pantallas:
- Usuarios
- Roles y permisos
- Equipos
- Catalogos (estados, prioridades)
- Configuracion de KPI
