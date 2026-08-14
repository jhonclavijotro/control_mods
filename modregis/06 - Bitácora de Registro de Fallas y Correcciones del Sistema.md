# 06 - Bitácora de Registro de Fallas y Correcciones del Sistema

> Baúl Obsidian: `modregis` | Sección 06

---

## 🛠️ Propósito de la Bitácora de Fallas y Correcciones

Esta sección del baúl **`modregis`** registra de manera cronológica los incidentes técnicos, errores de ejecución, fallos en la lógica de negocio y bugs de la interfaz de usuario identificados durante las fases de desarrollo y operación, así como su diagnóstico de causa raíz y las correcciones aplicadas al sistema.

---

## 📋 Registro Histórico de Incidencias Técnicas

### 🔴 Incidencia #001: Error de Importación Relativa al Ejecutar `python .\backend\main.py`

* **Fecha de Registro**: 2026-08-14
* **Componente Afectado**: `backend/main.py` y `backend/models.py`
* **Síntoma / Mensaje de Error**:
  ```text
  Traceback (most recent call last):
    File "D:\Antigravity\Projects\Control Mod\backend\main.py", line 14, in <module>
      from .database import engine, Base, get_db, SessionLocal, auto_migrate_db_schema
  ImportError: attempted relative import with no known parent package
  ```
* **Causa Raíz**:
  Python no asigna un paquete padre (`__package__ is None`) cuando un script se ejecuta directamente desde la consola (`python backend/main.py`). Al usar importaciones relativas estrictas (`from .database import ...`), la ejecución directa falla por falta de contexto de paquete.
* **Solución Aplicada**:
  1. En `backend/models.py` y `backend/main.py`, se envolvieron las importaciones en bloques de tolerancia `try / except ImportError`, intentando primero la importación relativa (para ejecución en paquete uvicorn) y recurriendo a importación directa de directorio en caso contrario.
  2. Se agregó un bloque de entrada principal `if __name__ == "__main__":` en `backend/main.py` para iniciar el servidor Uvicorn automáticamente en el puerto `8000`.

---

### 🔴 Incidencia #002: Horas de Operación no se Actualizaban al Modificar la Fecha de Instalación (`installed_at`)

* **Fecha de Registro**: 2026-08-14
* **Componente Afectado**: `backend/solar_engine.py` (Función `calculate_module_metrics`)
* **Síntoma / Comportamiento**:
  Al ingresar o modificar la fecha y hora de instalación (`installed_at`) de una ranura o módulo a una fecha reciente (por ejemplo, hace 2 días o ayer), las horas útiles de operación (`net_operating_hours`) permanecían congeladas en ~330 horas sin reflejar el cambio.
* **Causa Raíz**:
  En `backend/solar_engine.py`, existía un condicional de sobreescritura forzada:
  ```python
  if (current_time - eval_start).total_seconds() < 86400 * 7:
      eval_start = min(eval_start, default_baseline)
  ```
  Esta lógica anulaba cualquier fecha de instalación menor a 7 días y la retrotraía a la línea base por defecto (30 días atrás), impidiendo que el motor recalculase las horas para fechas recientes.
* **Solución Aplicada**:
  Se eliminó el condicional de sobreescritura forzada de 7 días. Ahora `eval_start` adopta estrictamente la fecha `installed_at` configurada por el usuario, calculando con exactitud las horas de radiación solar activa (07:00 AM – 06:00 PM) acumuladas desde dicha fecha.

---

### 🔴 Incidencia #003: Ausencia de Fecha de Instalación en el Catálogo General y Desfasamiento de Hora Local (UTC)

* **Fecha de Registro**: 2026-08-14
* **Componente Afectado**: `static/index.html`, `static/js/app.js` y `backend/main.py` (`GET /api/modules`)
* **Síntoma / Comportamiento**:
  1. Las fechas de instalación ingresadas previamente no se mostraban en la tabla del **Catálogo e Inventario General de Módulos**.
  2. Al abrir la ventana modal para editar la fecha de instalación, la hora se cargaba desfasada en varias horas respecto a la hora local guardada.
* **Causa Raíz**:
  1. La tabla `#tab-modules` en `index.html` y la función `renderModulesCatalog()` en `app.js` carecían de una columna dedicada para la **Fecha de Instalación**.
  2. El endpoint `/api/modules` no exponía la propiedad `installed_at` en el nivel superior del objeto JSON.
  3. En JavaScript, el método `new Date(dateStr).toISOString().slice(0, 16)` convertía la hora local guardada a UTC (agregando +5 horas en zona UTC-5), distorsionando el valor cargado en `<input type="datetime-local">`.
* **Solución Aplicada**:
  1. Se añadió la columna **Fecha de Instalación** en la tabla del catálogo (`index.html` y `app.js`) y se incorporó en el recuadro de métricas de las tarjetas de los inversores.
  2. Se actualizó la respuesta del backend en `GET /api/modules` para incluir `"installed_at": installed_at.isoformat()`.
  3. Se creó la función helper `formatForDateTimeInput(dateStr)` en `app.js` para formatear valores en hora local sin alterar la zona horaria al cargar la ventana modal.

---

### 🔴 Incidencia #004: Disparidad de Horas en Historial y Variación al Refrescar vía Túnel Ngrok / Red Local

* **Fecha de Registro**: 2026-08-14
* **Componente Afectado**: `static/js/app.js` (Funciones de precargado de fechas en modales y `formatDate`)
* **Síntoma / Comportamiento**:
  1. Al acceder a la aplicación desde otro equipo en la red local o mediante la URL pública de Ngrok (`https://...ngrok-free.dev`), las fechas y horas registradas en la tabla de historial aparecían desplazadas respecto a las mostradas en el servidor host local.
  2. Al refrescar la página, las horas de operación acumuladas y los registros mostraban ligeras variaciones de decimales.
* **Causa Raíz**:
  1. **Inicialización en UTC en Formularios Modales**: La precarga de fechas en los modales de parada, arranque y reemplazo usaba `new Date().toISOString().slice(0, 16)`, lo cual generaba cadenas de fecha en formato UTC (desplazadas +5 horas en zona UTC-5). Al guardar cualquier evento, se registraba la hora en el futuro.
  2. **Interpretación Dispar entre Navegadores**: La función `formatDate(dateStr)` usaba `new Date(dateStr).toLocaleString('es-ES', ...)`. Al recibir fechas ISO sin sufijo de zona horaria (`YYYY-MM-DDTHH:mm:ss`), navegadores en distintas plataformas (Chrome vs Safari vs Firefox en clientes remotos de Ngrok) interpretaban alternadamente la cadena como hora UTC o local, distorsionando las horas en la interfaz remota.
  3. **Cálculo en Tiempo Real de Generación Solar**: Durante la ventana de radiación (7:00 AM – 6:00 PM), el motor `solar_engine.py` recalcula continuamente el tiempo de operación útil en tiempo real con `datetime.utcnow()`. Cada 6 minutos transcurridos, se suma `0.1 hrs` a la métrica acumulada. Este comportamiento dinámico es correcto por diseño, pero se percibía inconsistente debido al desfase de zona horaria.
* **Solución Aplicada**:
  1. Se estandarizaron los valores por defecto en todas las ventanas modales usando `formatForDateTimeInput()`, garantizando que la fecha e ISO-local se envíen siempre en la hora local exacta del cliente sin desviaciones a UTC.
  2. Se reescribió `formatDate(dateStr)` en `app.js` para extraer determinísticamente los componentes de la fecha (`getDate()`, `getMonth()`, `getFullYear()`, `getHours()`, `getMinutes()`) sobre la cadena sin zona horaria, asegurando idéntica visualización en todos los clientes web (local, remoto, ngrok o móvil).

---

### 🔴 Incidencia #005: Falta de Contraste e Legibilidad en Banner de Stakeholders al Cambiar a Tema Claro

* **Fecha de Registro**: 2026-08-14
* **Componente Afectado**: `static/css/styles.css` (Reglas `.read-only-banner` en `[data-theme="light"]`)
* **Síntoma / Comportamiento**:
  En el entorno de Solo Lectura (Stakeholders), al alternar la interfaz hacia el **Tema Claro**, el texto del aviso amarillo fijado en la parte superior se volvía ilegible debido a una combinación de texto amarillo claro (`#fef08a`) sobre fondo ámbar claro.
* **Causa Raíz**:
  La regla CSS `.read-only-banner` definía un color de texto explícito en tono amarillo pastel para tema oscuro (`color: #fef08a`). Al no existir una regla de sobreescritura específica en el bloque `[data-theme="light"]`, el banner mantenía el texto amarillo sobre el fondo claro del tema diurno, anulando el contraste visual.
* **Solución Aplicada**:
  Se incorporaron reglas CSS específicas en `styles.css` para `[data-theme="light"] .read-only-banner`, aplicando un gradiente suave en fondo ámbar claro (`#fef3c7` a `#fde68a`), borde ámbar (`#f59e0b`) y texto en tono marrón/ámbar oscuro de alto contraste (`#78350f` / `#451a03`), garantizando legibilidad 100% bajo estándares WCAG tanto en modo claro como en modo oscuro.

---

## 🔗 Notas Relacionadas
- [[00 - Visión General y Arquitectura]]
- [[02 - Manual de Usuario y Operaciones]]
- [[03 - Documentación de API REST]]
- [[04 - Matriz de Pruebas y Validación]]
- [[05 - Hoja de Ruta y Posibles Mejoras]]
