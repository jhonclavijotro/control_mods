# Regla de Memoria Permanente: Arquitectura Frontend Defensiva y Prevención de Excepciones DOM

Esta regla establece las pautas obligatorias para evitar que modificaciones en la estructura HTML o manipulación de eventos en JavaScript detengan la cascada de inicialización o impidan la carga de datos de las API REST.

## 1. Verificación Obligatoria de Nulidad en Elementos DOM
- **Regla**: Ninguna llamada a `document.getElementById()`, `document.querySelector()` o selección de nodos puede encadenar directamente metodos como `.addEventListener()`, `.classList`, `.innerHTML` o `.style` sin una comprobación previa.
- **Patrón Correcto**:
  ```javascript
  const element = document.getElementById('my-element');
  if (element) {
      element.addEventListener('click', handler);
  }
  // O encadenamiento opcional defensivo:
  document.getElementById('my-element')?.addEventListener('click', handler);
  ```

## 2. Declaración de Variables de Estado (Evitar TDZ)
- **Regla**: Todas las variables globales o de estado (`activeCharts`, `invertersData`, `currentTab`) deben ser declaradas al inicio del script en la sección **App State**, antes de ejecutar cualquier función de tema, eventos o peticiones de red.

## 3. Encapsulamiento en la Cascada de Inicialización (`initApp`)
- **Regla**: En la función principal de entrada (`initApp`), cada invocación de vinculación de eventos o configuración debe estar aislada en su propio bloque `try { ... } catch (err)`.
- **Patrón Correcto**:
  ```javascript
  async function initApp() {
      try { initTheme(); } catch (e) { console.error('Error initTheme:', e); }
      try { bindTabEvents(); } catch (e) { console.error('Error bindTabEvents:', e); }
      try { bindKPICardEvents(); } catch (e) { console.error('Error bindKPICardEvents:', e); }
      try { await loadAllData(); } catch (e) { console.error('Error loadAllData:', e); }
  }
  ```
  *Efecto*: Si un componente o botón fue removido del HTML, la excepción se captura de forma silenciosa/logueada sin detener la ejecución de `loadAllData()`.

## 4. Verificación Automatizada vía Chrome DevTools Protocol (CDP)
- **Regla**: Antes de declarar una tarea frontend como completada, se debe ejecutar una prueba runtime conectada por WebSocket al inspector DevTools para verificar **0 excepciones no capturadas** (`Runtime.exceptionThrown`) en el navegador.
