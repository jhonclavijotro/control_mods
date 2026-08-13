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

## 🔗 Notas Relacionadas
- [[01 - Guía de Instalación y Despliegue]]
- [[02 - Manual de Usuario y Operaciones]]
- [[03 - Documentación de API REST]]
- [[05 - Hoja de Ruta y Posibles Mejoras]]
