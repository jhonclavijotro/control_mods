# 01 - Guía de Instalación y Despliegue

> Baúl Obsidian: `modregis` | Sección 01

---

## 🛠️ Requisitos Previos

Antes de ejecutar o desplegar la aplicación, asegúrese de contar con:
- **Docker** y **Docker Compose** (recomendado para producción y entornos aislados).
- **Python 3.11+** (para desarrollo local sin contenedores).
- **Make** (opcional, para ejecutar los comandos simplificados del `Makefile`).
- **Cuenta y Token de ngrok** (para exponer la visión de stakeholders a internet).

---

## 🔑 Configuración Inicial del Archivo de Entorno (`.env`)

Antes de iniciar los contenedores o el túnel, cree el archivo `.env` en la raíz del proyecto basándose en `.env.example`:

```env
# Configuración de variables de entorno para Docker / Ngrok
NGROK_AUTHTOKEN=tu_authtoken_de_ngrok
NGROK_DOMAIN=chiquita-unstructural-maura.ngrok-free.dev
```

> [!NOTE]
> El archivo `.env` está registrado en `.gitignore` para proteger tus llaves privadas y tokens de seguridad de ser publicados en el repositorio Git.

---

## 🚀 Paso a Paso para Levantar la Aplicación

### 📍 Formas de Acceso según el Rol

| Visión / Rol | Puerto / URL | Modo de Ejecución | Descripción |
| :--- | :--- | :--- | :--- |
| **Visión Operario** | `http://localhost:8000` | Operaciones completas (`READ_ONLY_MODE=false`) | Permite registrar paradas, reinicios con diagnóstico obligatorio, reemplazos de módulos y gestión de repuestos. |
| **Visión Stakeholder (Local)** | `http://localhost:8001` | Solo lectura (`READ_ONLY_MODE=true`) | Permite visualizar el estado en tiempo real, métricas e historial. Bloquea botones de modificación. |
| **Visión Stakeholder (Web Túnel)** | `https://chiquita-unstructural-maura.ngrok-free.dev` | Solo lectura expuesta vía ngrok | Acceso público seguro desde cualquier lugar a la visión de Stakeholders. |

---

### Opción 1: Usando el Makefile (Recomendado)

El archivo `Makefile` automatiza las tareas comunes de construcción y ejecución:

```bash
# 1. Ver el menú de ayuda con todos los comandos disponibles
make help

# 2. Construir la imagen Docker local de la aplicación
make build

# 3. Iniciar la Visión Operario (Modo Administrador - Puerto 8000)
make up

# 4. Iniciar la Visión Stakeholder (Modo Solo Lectura - Puerto 8001)
make stakeholder

# 5. Iniciar la Visión Stakeholder con Túnel Seguro ngrok expuesto a la Web
make tunnel
# (o alias: make ngrok)

# 6. Ver logs en tiempo real de todos los servicios
make logs

# 7. Detener todos los contenedores activos
make down
```

---

### Opción 2: Usando Docker Compose Directamente

```bash
# Iniciar la Visión Operario (Administrador)
docker compose up -d solar-control-app

# Iniciar la Visión Stakeholder (Solo Lectura local en Puerto 8001)
docker compose up -d solar-control-stakeholder

# Iniciar la Visión Stakeholder + Túnel Seguro ngrok
docker compose up -d solar-control-stakeholder ngrok

# Iniciar todo el stack completo
docker compose up -d

# Detener todos los servicios
docker compose down
```

---

### Opción 3: Entorno de Desarrollo Local (Sin Docker)

Si desea ejecutar el backend directamente en su máquina con Python:

1. **Activar el entorno virtual** (PowerShell):
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

2. **Instalar dependencias**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Iniciar el servidor Uvicorn**:
   - **Para Visión Operario**:
     ```powershell
     uvicorn backend.main:app --reload --port 8000
     ```
   - **Para Visión Stakeholder**:
     ```powershell
     $env:READ_ONLY_MODE="true"; uvicorn backend.main:app --reload --port 8001
     ```

> [!WARNING]
> **Importante**: No intente lanzar la aplicación ejecutando `python .\backend\main.py` directamente, ya que provocará un error `ImportError: attempted relative import with no known parent package`. Utilice siempre la herramienta Uvicorn mediante `uvicorn backend.main:app --reload`.

---

## 🌐 Verificación y Monitoreo del Túnel ngrok

Cuando ejecutas `make tunnel` o `docker compose up -d ngrok`:

1. El túnel conecta el puerto interno de la instancia de stakeholders (`solar-control-stakeholder:8000`) con el dominio web reservado.
2. Puedes verificar el estado, peticiones entrantes y tráfico del túnel abriendo en tu navegador local la consola de inspección de ngrok:
   - **Consola Dashboard Ngrok Local**: `http://localhost:4040`
3. **URL Web Pública para Stakeholders**:
   - `https://chiquita-unstructural-maura.ngrok-free.dev`

---

## 💾 Persistencia de Datos y Migración a Otro Equipo

### 📍 Ubicación Física de los Datos:
Toda la información del sistema se almacena de forma persistente dentro de la carpeta del proyecto:
* **Base de Datos SQLite**: `./data/solar_farm.db` (Contiene seriales, paradas, diagnósticos, reemplazos y repuestos).
* **Archivos Adjuntos**: `./data/uploads/` (Contiene fotos, documentos o reportes cargados en mantenimientos).

### 🚚 ¿Cómo migrar la aplicación a otro PC sin perder información?
1. **No requiere volver a configurar nada**: Todos los seriales, fechas de instalación e historial de mantenimientos se conservan automáticamente.
2. **Procedimiento de Migración**:
   - Copia la carpeta completa del proyecto (`Control Mod`) al nuevo computador (asegurándote de incluir la carpeta `./data/`).
   - Copia o crea el archivo `.env` en la raíz con tus llaves de Ngrok.
   - En el nuevo PC, ejecuta `docker compose up -d` (o `make up`).
3. El sistema reconocerá de inmediato el archivo `solar_farm.db` existente y desplegará toda la información previa intacta.

---

## 🔗 Notas Relacionadas
- [[00 - Visión General y Arquitectura]]
- [[02 - Manual de Usuario y Operaciones]]
- [[04 - Matriz de Pruebas y Validación]]
