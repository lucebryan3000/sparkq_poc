# SparkQ Workflow Diagrams

> Visual diagrams showing how SparkQ components interact and data flows through the system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Task Lifecycle](#task-lifecycle)
3. [Request Flow](#request-flow)
4. [Queue Runner Workflow](#queue-runner-workflow)
5. [Stale Task Detection](#stale-task-detection)
6. [Session & Queue Hierarchy](#session--queue-hierarchy)
7. [Configuration Loading](#configuration-loading)
8. [UI Component Architecture](#ui-component-architecture)

---

## System Overview

### High-Level Component Diagram

```mermaid
graph TB
    subgraph "User Interfaces"
        CLI[CLI<br/>sparkq.sh / typer]
        WebUI[Web Dashboard<br/>Browser]
        Runner[Queue Runner<br/>Python Script]
    end

    subgraph "Application Layer"
        API[FastAPI Server<br/>api.py]
        Storage[Storage Layer<br/>storage.py]
    end

    subgraph "Data Layer"
        DB[(SQLite Database<br/>WAL Mode)]
        Config[Configuration<br/>sparkq.yml]
    end

    subgraph "Background Services"
        Purge[Auto-Purge<br/>Thread]
        AutoFail[Auto-Fail<br/>Thread]
    end

    CLI -->|HTTP| API
    WebUI -->|HTTP| API
    Runner -->|HTTP| API

    API --> Storage
    Storage --> DB

    API --> Config

    Purge --> Storage
    AutoFail --> Storage
```

### Server Startup Sequence

```mermaid
sequenceDiagram
    participant User
    participant sparkq.sh
    participant server.py
    participant api.py
    participant storage.py
    participant SQLite

    User->>sparkq.sh: ./sparkq.sh start
    sparkq.sh->>server.py: Start server

    server.py->>server.py: Acquire lockfile
    server.py->>server.py: Load sparkq.yml
    server.py->>storage.py: Initialize storage
    storage.py->>SQLite: Create/migrate schema
    SQLite-->>storage.py: Ready

    server.py->>server.py: Start Auto-Purge thread
    server.py->>server.py: Start Auto-Fail thread

    server.py->>api.py: Create FastAPI app
    server.py->>server.py: Launch Uvicorn

    server.py-->>User: Server running on port 5005
```

---

## Task Lifecycle

### Complete Task Flow

```mermaid
stateDiagram-v2
    [*] --> Queued: POST /api/tasks

    Queued --> Running: POST /api/tasks/{id}/claim

    Running --> Succeeded: POST /api/tasks/{id}/complete
    Running --> Failed: POST /api/tasks/{id}/fail
    Running --> Failed: Auto-fail (2× timeout)

    Succeeded --> Purged: Auto-purge (N days)
    Failed --> Purged: Auto-purge (N days)

    Failed --> Queued: POST /api/tasks/{id}/requeue

    Succeeded --> [*]
    Failed --> [*]
    Purged --> [*]
```

### Task State Transitions

```mermaid
flowchart LR
    subgraph "Creation"
        A[Client] -->|enqueue| B[QUEUED]
    end

    subgraph "Execution"
        B -->|claim| C[RUNNING]
        C -->|complete| D[SUCCEEDED]
        C -->|fail| E[FAILED]
        C -->|timeout| E
    end

    subgraph "Recovery"
        E -->|requeue| B
        E -->|rerun| B2[New Task<br/>QUEUED]
    end

    subgraph "Cleanup"
        D -->|purge| F[DELETED]
        E -->|purge| F
    end
```

---

## Request Flow

### API Request Processing

```mermaid
sequenceDiagram
    participant Client
    participant FastAPI
    participant Handler
    participant Storage
    participant SQLite

    Client->>FastAPI: HTTP Request
    FastAPI->>FastAPI: Validate request
    FastAPI->>Handler: Route to handler

    Handler->>Storage: Call storage method
    Storage->>SQLite: Execute SQL
    SQLite-->>Storage: Result rows
    Storage-->>Handler: Domain objects

    alt Success
        Handler-->>FastAPI: Response data
        FastAPI-->>Client: 200 OK + JSON
    else Domain Error
        Handler-->>FastAPI: SparkQError
        FastAPI-->>Client: 400/404/409 + error
    else Unhandled Error
        Handler-->>FastAPI: Exception
        FastAPI-->>Client: 500 + error
    end
```

### Task Creation Flow

```mermaid
flowchart TD
    A[Client Request] --> B{Validate Input}
    B -->|Invalid| C[400 ValidationError]
    B -->|Valid| D[Check Queue Exists]
    D -->|Not Found| E[404 NotFoundError]
    D -->|Found| F[Create Task Record]
    F --> G[Generate Task ID]
    G --> H[Set status=queued]
    H --> I[Insert into tasks table]
    I --> J[Return TaskResponse]
```

---

## Queue Runner Workflow

### Continuous Polling Mode

```mermaid
flowchart TD
    A[Start Queue Runner] --> B[Load Configuration]
    B --> C[Resolve Base URL]
    C --> D{Poll Loop}

    D --> E[GET /api/tasks<br/>queue_id=X, status=queued]
    E --> F{Tasks Found?}

    F -->|No| G[Sleep poll_interval]
    G --> D

    F -->|Yes| H[Select First Task]
    H --> I[POST /api/tasks/{id}/claim]
    I --> J[Stream Prompt to stdout]
    J --> K[Wait for Execution]
    K --> L{Success?}

    L -->|Yes| M[POST /api/tasks/{id}/complete]
    L -->|No| N[POST /api/tasks/{id}/fail]

    M --> D
    N --> D
```

### Task Execution Sequence

```mermaid
sequenceDiagram
    participant Runner as Queue Runner
    participant API as SparkQ API
    participant Claude as Claude (Chat)
    participant User as Developer

    loop Poll Loop
        Runner->>API: GET /api/tasks?queue_id=X&status=queued
        API-->>Runner: [task1, task2, ...]

        opt Tasks Available
            Runner->>API: POST /api/tasks/{id}/claim
            API-->>Runner: Task details + payload

            Runner->>Claude: Stream prompt to stdout
            Note over Claude,User: Claude reads prompt<br/>executes instructions

            User->>Claude: Reviews & approves actions
            Claude->>Claude: Executes task

            alt Task Succeeds
                Runner->>API: POST /api/tasks/{id}/complete
            else Task Fails
                Runner->>API: POST /api/tasks/{id}/fail
            end
        end

        Runner->>Runner: Sleep(poll_interval)
    end
```

---

## Stale Task Detection

### Auto-Fail Flow

```mermaid
flowchart TD
    A[Auto-Fail Thread<br/>Every 30 seconds] --> B[Query Running Tasks]
    B --> C{For Each Task}

    C --> D[Calculate Elapsed Time]
    D --> E{elapsed > timeout × 1.0?}

    E -->|No| C
    E -->|Yes| F{Already Warned?}

    F -->|No| G[Set stale_warned_at]
    F -->|Yes| H{elapsed > timeout × 2.0?}

    G --> H

    H -->|No| C
    H -->|Yes| I[Set status=failed]
    I --> J[Set error message]
    J --> K[Log auto-fail event]
    K --> C
```

### Timeout Thresholds

```mermaid
gantt
    title Task Timeout Timeline
    dateFormat X
    axisFormat %s

    section Task Execution
    Active Execution        :a1, 0, 600

    section Warnings
    Warning Threshold (1×)  :milestone, m1, 600, 0

    section Auto-Fail
    Grace Period            :a2, 600, 1200
    Auto-Fail (2×)          :milestone, m2, 1200, 0
```

---

## Session & Queue Hierarchy

### Entity Relationships

```mermaid
erDiagram
    PROJECT ||--o{ SESSION : contains
    SESSION ||--o{ QUEUE : contains
    QUEUE ||--o{ TASK : contains

    PROJECT {
        string id PK
        string name
        string repo_path
    }

    SESSION {
        string id PK
        string project_id FK
        string name
        string status
        datetime started_at
        datetime ended_at
    }

    QUEUE {
        string id PK
        string session_id FK
        string name
        string instructions
        string model_profile
        string status
    }

    TASK {
        string id PK
        string queue_id FK
        string tool_name
        string task_class
        text payload
        string status
        int timeout
        text result
        text error
        datetime claimed_at
        datetime finished_at
    }
```

### Status Flow

```mermaid
flowchart LR
    subgraph Session
        S1[active] --> S2[ended]
    end

    subgraph Queue
        Q1[active] --> Q2[ended]
        Q2 --> Q3[archived]
        Q3 -.->|unarchive| Q2
    end

    subgraph Task
        T1[queued] --> T2[running]
        T2 --> T3[succeeded]
        T2 --> T4[failed]
        T4 -.->|requeue| T1
    end
```

---

## Configuration Loading

### Resolution Chain

```mermaid
flowchart TD
    A[Start] --> B{SPARKQ_CONFIG<br/>env var set?}
    B -->|Yes| C[Load from env path]
    B -->|No| D{sparkq.yml in CWD?}
    D -->|Yes| E[Load from CWD]
    D -->|No| F[Load from project root]

    C --> G[Parse YAML]
    E --> G
    F --> G

    G --> H[Merge with defaults]
    H --> I[Validate configuration]
    I --> J[Return Config object]
```

### Configuration Structure

```mermaid
classDiagram
    class Config {
        +project: ProjectConfig
        +server: ServerConfig
        +database: DatabaseConfig
        +purge: PurgeConfig
        +task_classes: Dict
        +tools: Dict
        +queue_runner: RunnerConfig
        +defaults: DefaultsConfig
    }

    class ProjectConfig {
        +name: str
        +repo_path: str
    }

    class ServerConfig {
        +host: str
        +port: int
    }

    class DatabaseConfig {
        +path: str
        +mode: str
    }

    class TaskClass {
        +name: str
        +timeout: int
    }

    class Tool {
        +name: str
        +description: str
        +task_class: str
    }

    Config --> ProjectConfig
    Config --> ServerConfig
    Config --> DatabaseConfig
    Config --> TaskClass
    Config --> Tool
```

---

## UI Component Architecture

### Page Navigation

```mermaid
flowchart TD
    subgraph "Router (app-core.js)"
        A[URL Change] --> B{Parse Route}
        B --> C[/dashboard]
        B --> D[/settings]
        B --> E[Legacy Routes]

        E --> F[Redirect to new route]

        C --> G[Show Dashboard Page]
        D --> H[Show Settings Page]
    end

    subgraph "Pages"
        G --> I[dashboard.js]
        H --> J[config.js]
    end

    subgraph "Components"
        I --> K[quick-add.js]
        I --> L[Stat Cards]
        I --> M[Task List]
    end
```

### Module Dependencies

```mermaid
flowchart BT
    subgraph "Core Layer"
        A[app-core.js<br/>API, Utils, Router]
        B[ui-utils.js<br/>Modals, Toasts, Formatting]
    end

    subgraph "Component Layer"
        C[quick-add.js<br/>Task Entry]
    end

    subgraph "Page Layer"
        D[dashboard.js]
        E[queues.js]
        F[tasks.js]
        G[config.js]
        H[scripts.js]
    end

    D --> A
    D --> B
    D --> C

    E --> A
    E --> B

    F --> A
    F --> B

    G --> A
    G --> B

    H --> A
    H --> B

    C --> A
    C --> B
```

### Event Flow

```mermaid
sequenceDiagram
    participant User
    participant DOM
    participant ActionRegistry
    participant Handler
    participant API
    participant UI

    User->>DOM: Click button[data-action]
    DOM->>ActionRegistry: delegatedHandler(event)
    ActionRegistry->>ActionRegistry: Find registered action
    ActionRegistry->>Handler: Call action handler

    Handler->>API: api('POST', '/api/...')
    API-->>Handler: Response data

    alt Success
        Handler->>UI: showToast('Success', 'success')
        Handler->>DOM: Update DOM
    else Error
        Handler->>UI: showError('Failed: ...')
    end
```

---

## Data Flow Summary

### Complete System Flow

```mermaid
flowchart TB
    subgraph "Input Sources"
        CLI[CLI Commands]
        WebUI[Web Dashboard]
        Runner[Queue Runner]
    end

    subgraph "API Gateway"
        FastAPI[FastAPI Server<br/>Port 5005]
    end

    subgraph "Business Logic"
        Handlers[Route Handlers]
        Validation[Input Validation]
        ErrorHandling[Error Handling]
    end

    subgraph "Data Access"
        Storage[Storage Layer]
        Queries[SQL Queries]
    end

    subgraph "Persistence"
        SQLite[(SQLite DB<br/>WAL Mode)]
        Backups[(Backups)]
    end

    subgraph "Background"
        AutoPurge[Auto-Purge]
        AutoFail[Auto-Fail]
    end

    CLI --> FastAPI
    WebUI --> FastAPI
    Runner --> FastAPI

    FastAPI --> Handlers
    Handlers --> Validation
    Validation --> ErrorHandling
    ErrorHandling --> Storage

    Storage --> Queries
    Queries --> SQLite

    SQLite --> Backups

    AutoPurge --> Storage
    AutoFail --> Storage
```

---

## Quick Reference

### Status Values

| Entity | Valid Statuses |
|--------|----------------|
| Session | `active`, `ended` |
| Queue | `active`, `ended`, `archived` |
| Task | `queued`, `running`, `succeeded`, `failed` |

### Timeout Classes

| Class | Default Timeout | Use Case |
|-------|-----------------|----------|
| `FAST_SCRIPT` | 120s | Quick scripts |
| `MEDIUM_SCRIPT` | 600s | Standard scripts |
| `LLM_LITE` | 480s | Haiku, simple prompts |
| `LLM_HEAVY` | 1200s | Sonnet, complex tasks |

### API Endpoints by Category

| Category | Methods | Base Path |
|----------|---------|-----------|
| Health | GET | `/health` |
| Sessions | GET, POST, PUT, DELETE | `/api/sessions` |
| Queues | GET, POST, PUT, DELETE | `/api/queues` |
| Tasks | GET, POST, PUT, DELETE | `/api/tasks` |
| Config | GET, POST | `/api/config` |
| Tools | GET, POST, PUT, DELETE | `/api/tools` |
| Prompts | GET, POST, PUT, DELETE | `/api/prompts` |

---

*These diagrams use [Mermaid](https://mermaid.js.org/) syntax and render automatically on GitHub.*
