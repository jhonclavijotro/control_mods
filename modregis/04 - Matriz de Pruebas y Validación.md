# 04 - Matriz de Pruebas y Validación

> Baúl Obsidian: `modregis` | Sección 04

---

## 🧪 Estrategia de Pruebas

Esta matriz documenta los escenarios de prueba críticos para garantizar la estabilidad, integridad de datos y cumplimiento de reglas de seguridad en la aplicación.

---

## 📋 Casos de Prueba Críticos

### Caso 1: Validación de Diagnóstico Obligatorio en Reinicios

- **Objetivo**: Verificar que el sistema impida reanudar cualquier módulo sin proporcionar un diagnóstico técnico final.
- **Paso a Paso**:
  1. Intentar registrar el arranque de una parada pasando `diagnosis: ""` o solo espacios `"   "`.
- **Resultado Esperado**:
  - **Frontend**: Notificación Toast de error e impedimento del envío del formulario.
  - **Backend**: Código de respuesta **`HTTP 400 Bad Request`** con el detalle:  
    *`"Es obligatorio proporcionar un diagnóstico final o solución aplicada para registrar el arranque."`*
- **Comando de Verificación (cURL)**:
  ```bash
  curl -X POST http://localhost:8000/api/repairs/restart \
       -H "Content-Type: application/json" \
       -d '{"repair_id": 1, "restart_time": "2026-08-12T20:00:00", "diagnosis": ""}'
  ```

---

### Caso 2: Restricción de Modo Solo Lectura (Stakeholders)

- **Objetivo**: Garantizar que el entorno de stakeholders bloquee todas las operaciones de modificación.
- **Paso a Paso**:
  1. Iniciar la instancia de stakeholders (`make stakeholder` en puerto `8001`).
  2. Consultar `GET http://localhost:8001/api/config` &rarr; Debe retornar `"read_only_mode": true`.
  3. Realizar una petición `POST` o `DELETE` a `http://localhost:8001/api/repairs/stop` o `http://localhost:8001/api/modules/TEST`.
- **Resultado Esperado**:
  - Respuesta **`HTTP 403 Forbidden`** con el detalle:  
    *`"Modo de solo lectura activado (Stakeholders). Las operaciones de modificación están restringidas en este entorno."`*
- **Comando de Verificación (Python)**:
  ```python
  import urllib.request, urllib.error
  req = urllib.request.Request('http://localhost:8001/api/repairs/stop', data=b'{}', headers={'Content-Type': 'application/json'})
  try:
      urllib.request.urlopen(req)
  except urllib.error.HTTPError as e:
      print("Código:", e.code)  # Debe imprimir 403
      print("Respuesta:", e.read().decode())
  ```

---

### Caso 3: Cálculo de Horas Útiles Solares (Ventana 7:00 AM - 6:00 PM)

- **Objetivo**: Verificar que el motor `solar_engine.py` solo compute horas dentro de la ventana de radiación solar activa.
- **Paso a Paso**:
  1. Registrar una parada que abarque de 5:00 AM a 9:00 AM (4 horas astronómicas).
- **Resultado Esperado**:
  - Las horas de indisponibilidad contabilizadas deben ser solo 2 horas (de 7:00 AM a 9:00 AM).

---

### Caso 4: Reemplazo Hot-Swap e Histórico de Series

- **Objetivo**: Asegurar que al reemplazar un módulo, el serial saliente quede guardado en el log de sustitución y el nuevo módulo pase a estado `operating` en el slot correspondiente.
- **Resultado Esperado**:
  - Registro creado en `ReplacementLog` con `old_serial`, `new_serial`, `inverter_id`, `slot_number` y timestamp.

---

### Caso 5: Corrección de Línea Base de Disponibilidad (Cálculo de Uptime en Paradas Solares)

- **Objetivo**: Verificar que la disponibilidad (`uptime_percent`) no colapse a 0.0% cuando se registra una falla en el mismo día de la instalación o inicialización del sistema.
- **Paso a Paso**:
  1. Registrar una parada de 2.7 horas (ej: de 07:35 AM a 10:18 AM) para los inversores A1 y B2.
- **Resultado Esperado**:
  - El motor `solar_engine.py` establece una línea base operativa de al menos 30 días (~330 horas solares).
  - La disponibilidad calculada para los inversores afectados debe ser realista (~99.2%) y no 0.0%.

---

### Caso 6: Recálculo Dinámico de Horas de Operación según Fecha de Instalación (`installed_at`) y Visibilidad en Catálogo

- **Objetivo**: Verificar que modificar la fecha de instalación (`installed_at`) recalcule de forma inmediata y proporcional las horas útiles de operación solar (7am-6pm) y se refleje correctamente en la tabla del catálogo y en la ventana modal de edición sin desfasamiento de zona horaria.
- **Paso a Paso**:
  1. Ejecutar la petición `PUT /api/slots/A1/1/installed-at` enviando `installed_at: "<FECHA_HACE_2_DIAS>T07:00:00"`.
  2. Consultar `GET /api/inverters` y `GET /api/modules`.
  3. Navegar a la pestaña **Catálogo e Inventario General de Módulos** y abrir la ventana modal del botón `<i class="fa-regular fa-calendar-days">` Fecha Inst.
- **Resultado Esperado**:
  - `net_operating_hours` reporta exactamente **22.0 hrs** (2 días de radiación solar activa entre 7am y 6pm).
  - La columna **Fecha de Instalación** en la tabla del catálogo muestra la fecha ingresada formateada (`DD/MM/YYYY, HH:mm`).
  - La ventana modal de edición precarga en el campo `<input type="datetime-local">` la fecha previamente ingresada sin distorsión por conversión UTC.

---

## 🔗 Notas Relacionadas
- [[01 - Guía de Instalación y Despliegue]]
- [[02 - Manual de Usuario y Operaciones]]
- [[03 - Documentación de API REST]]
- [[05 - Hoja de Ruta y Posibles Mejoras]]
