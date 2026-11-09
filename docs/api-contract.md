# API Contract (MVP)

Base URL: `/api/v1`
Auth: `Authorization: Bearer <JWT>`
Format: JSON

## 1) Authentication

### POST /auth/login
Request:
```json
{
  "email": "gerente@empresa.com",
  "password": "***"
}
```

Response 200:
```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "uuid",
    "fullName": "Gerente General",
    "email": "gerente@empresa.com",
    "role": "manager"
  }
}
```

## 2) Users

### GET /users
Roles: manager, lead
Query params: `role`, `teamId`, `isActive`, `page`, `limit`

### POST /users
Roles: manager
```json
{
  "fullName": "Ana Perez",
  "email": "ana@empresa.com",
  "role": "worker",
  "teamId": "uuid"
}
```

## 3) Projects

### GET /projects
Query params: `status`, `teamId`, `search`, `page`, `limit`

### POST /projects
Roles: manager, lead
```json
{
  "code": "PRJ-2026-001",
  "name": "Implementacion ERP",
  "clientName": "Cliente X",
  "ownerTeamId": "uuid",
  "status": "active",
  "startDate": "2026-06-01",
  "endDate": "2026-09-30"
}
```

### GET /projects/:projectId/progress
Returns aggregated progress and overdue tasks.

## 4) Tasks

### GET /tasks
Query params: `projectId`, `assigneeId`, `status`, `priority`, `dueFrom`, `dueTo`, `page`, `limit`

### POST /tasks
Roles: manager, lead
```json
{
  "projectId": "uuid",
  "code": "TASK-001",
  "title": "Definir alcance",
  "description": "Reunion con stakeholders",
  "assigneeId": "uuid",
  "status": "todo",
  "priority": "high",
  "dueDate": "2026-06-10",
  "estimatedHours": 6
}
```

### PATCH /tasks/:taskId
Roles: manager, lead, worker (worker only own tasks)

## 5) Task Updates

### POST /task-updates
Roles: manager, lead, worker
```json
{
  "taskId": "uuid",
  "updateDate": "2026-06-03",
  "workedHours": 3.5,
  "progressPercent": 45,
  "blockerReason": "Esperando aprobacion del cliente",
  "comments": "Se completo primera parte"
}
```

### GET /task-updates
Query params: `taskId`, `userId`, `from`, `to`, `page`, `limit`

## 6) Mensajería de trabajo

Roles: manager, lead, worker. Las conversaciones son directas y entre dos personas activas. Los mensajes se conservan; no hay edición ni eliminación.

### GET /messaging/users
Returns active users available to message (excluding the signed-in user).

### GET /messaging/conversations
Returns the signed-in user's conversations, the other participant, latest message and unread count.

### POST /messaging/conversations
Opens an existing direct conversation or creates one.
```json
{ "recipientId": "uuid" }
```

### GET /messaging/conversations/:conversationId/messages
Returns up to 50 newest messages in chronological order and marks the conversation read for the signed-in user. Query `before` with a message UUID to load an older page.

### POST /messaging/conversations/:conversationId/messages
Sends a message and notifies the other participant.
```json
{
  "content": "¿Podemos revisar la entrega de hoy?",
  "projectId": "uuid",
  "taskId": "uuid"
}
```
`projectId` and `taskId` are optional; when both are supplied, the task must belong to that project.

## 7) Excel Import

### POST /imports/excel
Roles: manager, lead, worker
Content-Type: `multipart/form-data`
Field: `file`

Response 202:
```json
{
  "importId": "uuid",
  "status": "pending"
}
```

### GET /imports/:importId
Returns processing status and summary counters.

### GET /imports/:importId/errors
Returns row-level validation errors.

## 8) Dashboard and KPIs

### GET /dashboard/summary
Roles: manager, lead
Query params: `from`, `to`, `projectId`, `teamId`

Response 200:
```json
{
  "activeProjects": 8,
  "completionRate": 71.2,
  "overdueTasks": 14,
  "blockedTasks": 5,
  "hoursWorked": 412.5
}
```

### GET /dashboard/workload
Returns workload by employee.

### GET /dashboard/trends
Returns weekly velocity and delays trend.

## 9) Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload",
    "details": [
      {
        "field": "progressPercent",
        "message": "Must be between 0 and 100"
      }
    ]
  }
}
```
