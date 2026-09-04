# BRECHA — servidor en vivo (Fase 2)

## Contexto

La Fase 1 está terminada y validada: equipos, catálogo de herramientas, carga manual de
resultados de caso por el docente, proyector en vivo. Funciona bien para una primera prueba,
pero el docente tiene que tipear a mano cada Δ presupuesto/reputación, no hay noción de "en
qué caso estamos", y solo existe un nivel de reinicio.

Esta fase agrega la tabla de referencia de los 10 casos (con sus costos reales, los mismos
que usa la diapositiva de casos), un estado de ronda activa por el que avanza el docente, un
cronómetro automático, y hace que los equipos participen directamente desde su celular en
cada ronda en vez de que el docente cargue todo a mano. El docente conserva la posibilidad de
override manual para los casos discutibles ("le doy un ayudín a este equipo").

## Qué cambia respecto a Fase 1

- El campo "Caso #" deja de ser un número que el docente tipea: pasa a ser el **caso activo**
  de la sesión, con botones Siguiente/Anterior.
- El equipo ya no espera pasivamente a que el docente cargue el resultado: durante la ronda
  activa, ve el caso en su celular y puede tocar **"Reaccionar"** (si no tiene la herramienta
  preventiva) para pagar el costo de emergencia dentro del tiempo.
- El sistema resuelve la ruta de cada equipo automáticamente al vencer el cronómetro (o
  cuando el docente cierra la ronda a mano). El docente puede revisar y ajustar antes de
  confirmar — ahí es donde entra el "ayudín" que mencionaste.
- Se agrega seguimiento de categorías vulnerables con duración (rondas consecutivas) y efecto
  duplicado si se repite.
- Reset de dos niveles.

## Nueva tabla: casos (semilla, cargar tal cual — mismos valores que la diapositiva)

```sql
CREATE TABLE casos (
  numero INTEGER PRIMARY KEY,        -- 1 a 10
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  costo_reactiva INTEGER,            -- NULL en el caso especial (10)
  omision_presupuesto INTEGER,
  omision_reputacion INTEGER,
  preventiva_reputacion INTEGER DEFAULT 2,
  especial TEXT                      -- NULL, o 'auditoria_final' para el caso 10
);
```

| numero | categoria | titulo | costo_reactiva | omision_presupuesto | omision_reputacion |
|---|---|---|---|---|---|
| 1 | phishing | Fraude del CEO (BEC) | 5 | -5 | -4 |
| 2 | pass | Credential stuffing contra la VPN | 4 | -4 | -3 |
| 3 | social | Vishing con voz clonada por IA | 3 | -4 | -3 |
| 4 | ransom | Cifrado de servidores de producción | 6 | -7 | -5 |
| 5 | fake | Deepfake del CEO pidiendo donaciones | 3 | -4 | -4 |
| 6 | cloud | Bucket de almacenamiento público por error | 4 | -5 | -4 |
| 7 | cloud | Librería de código abierto comprometida | 3 | -5 | -4 |
| 8 | ransom | Día cero explotado activamente (RaaS) | 4 | -6 | -4 |
| 9 | fake | Comunicado falso de cierre de operaciones | 3 | -5 | -5 |
| 10 | general | Auditoría externa de cierre de ejercicio | NULL | NULL | NULL (ver especial abajo) |

El caso 10 es distinto: no tiene ruta por equipo, se resuelve leyendo el estado de
`vulnerabilidades` de cada equipo (ver más abajo) — por cada categoría de las 6 que **no**
esté vulnerable, +1 reputación; por cada categoría que sí lo esté, -3 reputación. Marcalo con
`especial = 'auditoria_final'` y resolvelo con lógica dedicada, no con el flujo normal de
ronda.

## Nueva tabla: vulnerabilidades

```sql
CREATE TABLE vulnerabilidades (
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  categoria TEXT NOT NULL,
  vulnerable_desde_caso INTEGER,     -- número de caso en que se activó, NULL si no vulnerable
  PRIMARY KEY (equipo_id, categoria)
);
```

Sembrar una fila por equipo × por cada una de las 6 categorías (`vulnerable_desde_caso =
NULL`) al crear un equipo o al reiniciar la partida.

## Nueva tabla: sesion (una sola fila, singleton)

```sql
CREATE TABLE sesion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  caso_actual INTEGER,               -- NULL antes de arrancar, 1-10 durante el juego
  ronda_estado TEXT NOT NULL DEFAULT 'inactiva', -- 'inactiva' | 'activa' | 'resuelta'
  ronda_inicio TEXT,                 -- timestamp ISO de cuándo arrancó el cronómetro
  ronda_duracion_seg INTEGER NOT NULL DEFAULT 90
);
```

## Flujo de una ronda

1. Docente presiona **"Siguiente caso"** en `/docente`. `sesion.caso_actual` avanza,
   `ronda_estado = 'activa'`, `ronda_inicio = ahora`. Se emite el evento de socket con el
   caso completo (`titulo`, `categoria` — pero **sin** revelar todavía qué ruta le conviene a
   cada equipo, eso lo calcula el equipo mirando su propio catálogo comprado).
2. En `/equipo/:id`, mientras `ronda_estado === 'activa'`:
   - Si el equipo ya tiene una herramienta comprada de la categoría del caso activo: se
     muestra un cartel "Ya estás cubierto" (informativo, no requiere acción — al resolver la
     ronda se le aplica Preventiva automáticamente).
   - Si no la tiene: se muestra un botón **"Reaccionar (cuesta {costo_reactiva})"**. Si lo
     toca antes de que venza el cronómetro, se descuenta ese costo de su presupuesto al
     instante (validar que le alcance — si no le alcanza, el botón se deshabilita) y queda
     marcado como que reaccionó en esta ronda.
   - Cuenta regresiva visible, calculada como `ronda_duracion_seg - (ahora - ronda_inicio)`.
3. La ronda se cierra de dos maneras posibles:
   - **Automática**: el cronómetro llega a cero (verificado server-side, no confiar en el
     reloj del cliente).
   - **Manual**: el docente presiona **"Cerrar ronda ahora"** en `/docente`, por si quiere
     cortarla antes de tiempo.
4. Al cerrar, el servidor calcula la ruta de cada equipo:
   - Tiene la herramienta de la categoría → **Preventiva**: `+preventiva_reputacion`, sin
     costo adicional (el costo ya lo pagó cuando compró la herramienta, en otro momento).
   - No la tiene pero reaccionó a tiempo → **Reactiva**: ya se le descontó el costo en el
     paso 2, no hay efecto adicional en reputación.
   - No la tiene y no reaccionó → **Omisión**: aplica `omision_presupuesto` y
     `omision_reputacion`. Si `vulnerabilidades` ya tenía esa categoría marcada como
     vulnerable para ese equipo (de un caso anterior sin resolver), **duplicar** ambos
     valores. Marcar (o mantener marcada) la categoría como vulnerable con
     `vulnerable_desde_caso = caso_actual` si no lo estaba ya.
   - Si la ruta terminó siendo Preventiva o Reactiva para una categoría que estaba marcada
     vulnerable, limpiarla (`vulnerable_desde_caso = NULL`) — el equipo "cerró la brecha".
5. `ronda_estado = 'resuelta'`. Se inserta una fila en `registro_casos` por equipo (igual que
   en Fase 1) y se emite el resultado a todas las vistas.
6. **Antes de que el docente pase al siguiente caso**, `/docente` muestra un resumen editable
   de lo que se va a aplicar a cada equipo (ruta calculada + deltas), con la posibilidad de
   tocar cualquier valor y ajustarlo a mano antes de confirmar — este es el "ayudín" para
   casos discutibles. Solo al confirmar se escribe en la base y se notifica a los equipos.
7. `/equipo/:id` muestra un **feedback visual** claro cuando le llega un resultado: un banner
   o toast que aparece un momento (5-6 segundos, con botón para cerrarlo antes) indicando la
   ruta obtenida y el cambio de presupuesto/reputación, coloreado según la ruta: verde
   Preventiva, ámbar Reactiva, rojo Omisión. No debe interrumpir la pantalla — se superpone y
   desaparece solo, el resto de la información sigue visible debajo.

## Caso especial: auditoría final (caso 10)

Al cerrar la ronda del caso 10, no aplica el flujo de arriba. Por cada equipo, recorrer sus 6
categorías en `vulnerabilidades`: +1 reputación por cada una con `vulnerable_desde_caso IS
NULL`, -3 reputación por cada una que sí esté vulnerable. Mostrar en el resumen editable del
paso 6 el desglose por categoría antes de confirmar.

## Vista /proyector — agregar

- Caso activo (número, categoría, título) y el cronómetro corriendo, sincronizado al segundo
  con el de los equipos (mismo timestamp de origen `ronda_inicio`, cada cliente calcula su
  propio countdown local a partir de eso — no depender de un tick del servidor por segundo).
- Un ícono o etiqueta por equipo indicando si tiene alguna categoría vulnerable en este
  momento (sin necesariamente decir cuál, para no regalarle la respuesta al resto de la
  clase mirando el proyector).

## Reset — dos niveles

- **"Reiniciar partida"** (ya existe): vuelve `equipos.presupuesto/reputacion` a 20/20, borra
  `compras`, `registro_casos`, resetea `vulnerabilidades` a NULL para todos, resetea
  `sesion` (`caso_actual = NULL`, `ronda_estado = 'inactiva'`). **Mantiene** las filas de
  `equipos` (nombres).
- **"Borrar todo"** (nuevo): lo anterior, y además elimina las filas de `equipos` (con sus
  compras y registros en cascada). Requiere un paso de confirmación reforzado — por ejemplo,
  que el docente tipee la palabra "BORRAR" en un campo antes de que el botón se habilite.
  Dejar claro en la UI, con una nota, que esto es distinto de reiniciar el contenedor Docker
  (que no borra nada, porque la base persiste a propósito).

## Fuera de alcance de esta fase

- Autenticación de equipos.
- Ajustar `ronda_duracion_seg` por caso individual (queda fijo por sesión, configurable desde
  `/docente` antes de arrancar).
- Sonido/alarma al vencer el cronómetro (lindo para Fase 3, no bloqueante).

## Criterios de aceptación

- [ ] El docente puede avanzar de un caso al siguiente con un botón, y el caso activo se ve
      igual (número, categoría, título) en `/docente`, `/equipo/:id` y `/proyector`.
- [ ] El cronómetro corre igual en todos los dispositivos conectados, calculado a partir de
      un mismo timestamp de origen, no de un contador independiente por cliente.
- [ ] Un equipo con la herramienta correcta ya comprada recibe Preventiva automáticamente al
      cerrar la ronda, sin tocar nada.
- [ ] Un equipo sin la herramienta que toca "Reaccionar" a tiempo paga el costo de emergencia
      y no recibe la penalización de Omisión.
- [ ] Un equipo que no hace nada y se vence el tiempo recibe Omisión automáticamente.
- [ ] Si una categoría ya estaba vulnerable para un equipo y vuelve a caer en Omisión en esa
      misma categoría, el efecto se duplica.
- [ ] El docente puede editar los deltas calculados antes de confirmarlos, ronda por ronda.
- [ ] El caso 10 se resuelve con la lógica especial de auditoría, no con el flujo normal.
- [ ] Al llegarle un resultado, el equipo ve un feedback visual temporal, coloreado según la
      ruta, que no bloquea el resto de la pantalla.
- [ ] "Reiniciar partida" mantiene los equipos; "Borrar todo" los elimina y pide confirmación
      reforzada.
- [ ] Reiniciar el contenedor Docker sigue sin borrar nada (se mantiene el criterio de Fase 1).
