# 03 - Documentación de API REST

> Baúl Obsidian: `modregis` | Sección 03

---

## 🌐 Especificación OpenAPI / Swagger

La documentación interactiva de la API REST se encuentra disponible automáticamente en:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## 📋 Resumen de Endpoints API

### 1. Configuración e Información General

#### `GET /api/config`
Retorna el estado de configuración en tiempo real de la instancia actual.
- **Respuesta `200 OK`**:
  ```json
  {
    "read_only_mode": false,
    "app_name": "Gestión de Módulos de Potencia - Granja Solar"
  }
  ```

#### `GET /api/dashboard`
Obtiene las métricas consolidadas de la granja solar, KPIs globales, estados de ranuras y logs recientes.
- **Campos devueltos**: `total_active_slots`, `operating_count`, `in_repair_count`, `spare_count`, `total_farm_operating_hours`, `recent_repairs`, `recent_replacements`, `read_only_mode`.

---

### 2. Estructura y Módulos de Potencia

#### `GET /api/inverters`
Retorna el listado completo de unidades inversoras (`A1`..`E1`), ranuras asociadas y métricas por módulo.

#### `GET /api/spares`
Lista los módulos de respaldo disponibles en el inventario de repuestos.

#### `POST /api/spares`
Registra un nuevo módulo de potencia en el inventario de repuestos.
- **Cuerpo JSON**:
  ```json
  {
    "serial_number": "MOD-SP-2026-X99"
  }
  ```

#### `DELETE /api/modules/{serial_number}`
Elimina un módulo de potencia no instalado del inventario.

---

### 3. Registro de Reparaciones y Paradas

#### `POST /api/repairs/stop`
Registra una parada o fallo de módulo de potencia.
- **Cuerpo JSON**:
  ```json
  {
    "inverter_id": "A1",
    "slot_number": 2,
    "stop_time": "2026-08-12T14:30:00",
    "reason": "Sobrecalentamiento en puente inversor Fase B",
    "attachment_path": null,
    "attachment_name": null
  }
  ```

#### `POST /api/repairs/restart`
Registra el arranque y reanudación de un módulo previamente detenido.
- **Cuerpo JSON**:
  ```json
  {
    "repair_id": 14,
    "restart_time": "2026-08-12T16:45:00",
    "diagnosis": "Se reemplazó tarjeta de control IGBT y se realizó prueba de aislamiento exitosa.",
    "attachment_path": null,
    "attachment_name": null
  }
  ```
- **Validación Estricta**: Devuelve `400 Bad Request` si `diagnosis` está vacío o nulo.

#### `POST /api/repairs/restart-inverter`
Restablece simultáneamente todas las paradas abiertas de una unidad inversora completa.
- **Validación Estricta**: Exige `diagnosis` obligatorio.

#### `POST /api/repairs/replace`
Registra el reemplazo de un módulo averiado por un módulo de respaldo.

#### `PUT /api/repairs/{repair_id}`
Edita los datos de un evento histórico de reparación. Si se incluye `restart_time`, exige obligatoriamente `diagnosis`.

---

## 🔒 Códigos de Respuesta HTTP

| Código | Significado | Causa |
| :---: | :--- | :--- |
| **`200 OK`** | Éxito | Petición procesada correctamente. |
| **`400 Bad Request`** | Error de Validación | Falta el diagnóstico obligatorio, la fecha de arranque es menor a la de parada o serial no válido. |
| **`403 Forbidden`** | Acción Restringida | Intento de modificación en una instancia con `READ_ONLY_MODE=true`. |
| **`404 Not Found`** | No Encontrado | Inversor, ranura, módulo o registro de reparación inexistente. |

---

## 🔗 Notas Relacionadas
- [[00 - Visión General y Arquitectura]]
- [[02 - Manual de Usuario y Operaciones]]
- [[04 - Matriz de Pruebas y Validación]]
