# BRECHA — servidor en vivo (Fase 1: MVP)

## Contexto

BRECHA es una simulación de ciberseguridad para clase (nivel universitario, Licenciatura en
Computación). Hasta ahora existe en versión "de mesa": diapositivas HTML para proyectar los
casos, una hoja/carta impresa por equipo, y una planilla Excel donde el docente anota a mano
qué ruta tomó cada equipo y qué le pasó.

El objetivo de este proyecto es reemplazar esa planilla manual por un servidor liviano que
corre en la PC del docente (vía Docker), al que los equipos se conectan desde su celular por
la WiFi del aula, y que muestra un ranking en vivo en el proyector.

**Esta fase (Fase 1) NO automatiza el cronómetro ni los límites de presupuesto por ronda.**
El docente sigue controlando el ritmo desde las diapositivas de casos y decide manualmente
qué ruta tomó cada equipo — pero en vez de anotarlo en Excel, lo carga acá y se ve reflejado
al instante en el proyector. Fases futuras (fuera de alcance de este documento) agregarán:
límite de presupuesto por ronda, cronómetro automático con aplicación automática de la ruta
Omisión, y seguimiento de cuánto tiempo lleva abierta una categoría vulnerable.

## Alcance de la Fase 1

Tres vistas, un servidor, una base de datos chiquita.

1. **Vista Docente** (`/docente`) — pantalla de control, la usa solo el profesor desde su
   propia compu.
2. **Vista Equipo** (`/equipo`) — la abre un integrante por grupo desde su celular.
3. **Vista Proyector** (`/proyector`) — pantalla de solo lectura para conectar al cañón.

Todas se actualizan solas (WebSocket), sin que nadie tenga que apretar F5.

## Modelo de datos

SQLite, un solo archivo. Cuatro tablas.

```sql
CREATE TABLE equipos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  presupuesto INTEGER NOT NULL DEFAULT 20,
  reputacion INTEGER NOT NULL DEFAULT 20,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE herramientas (
  id TEXT PRIMARY KEY,        -- slug, ej. 'mfa-accesos-criticos'
  categoria TEXT NOT NULL,    -- 'phishing' | 'pass' | 'social' | 'ransom' | 'fake' | 'cloud' | 'general'
  nombre TEXT NOT NULL,
  costo INTEGER NOT NULL,
  descripcion TEXT NOT NULL
);

CREATE TABLE compras (
  id INTEGER PRIMARY KEY,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  herramienta_id TEXT NOT NULL REFERENCES herramientas(id),
  costo_pagado INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE registro_casos (
  id INTEGER PRIMARY KEY,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  caso_numero INTEGER NOT NULL,       -- 1 a 10
  ruta TEXT NOT NULL,                 -- 'preventiva' | 'reactiva' | 'omision'
  delta_presupuesto INTEGER NOT NULL DEFAULT 0,
  delta_reputacion INTEGER NOT NULL DEFAULT 0,
  vulnerable INTEGER NOT NULL DEFAULT 0,  -- 0/1
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`equipos.presupuesto` y `equipos.reputacion` son el estado **actual** (arrancan en 20/20 y se
van modificando con cada compra o cada fila de `registro_casos` — no hace falta recalcular
sumando el historial cada vez, aunque el historial se guarda igual para poder mostrarlo y
para poder deshacer un error de carga).

### Catálogo de herramientas (semilla inicial, cargar tal cual)

| id | categoria | nombre | costo | descripcion |
|---|---|---|---|---|
| filtro-anti-phishing | phishing | Filtro anti-phishing + SPF/DKIM/DMARC | 3 | Verifica automáticamente la autenticidad del remitente y bloquea dominios falsificados. |
| capacitacion-phishing | phishing | Capacitación en detección de phishing | 2 | Entrena al personal para identificar enlaces, adjuntos y remitentes sospechosos. |
| mfa-accesos-criticos | pass | MFA en accesos críticos | 3 | Segundo factor de autenticación en VPN, correo y paneles de administración. |
| gestor-contrasenas | pass | Gestor de contraseñas corporativo | 2 | Contraseñas únicas y complejas por servicio, sin reutilización entre sistemas. |
| verificacion-fuera-banda | social | Protocolo de verificación fuera de banda | 2 | Confirmar pedidos sensibles por un canal distinto antes de actuar. |
| control-acceso-fisico | social | Control de acceso físico reforzado | 2 | Badges, control de tailgating y registro de visitantes. |
| backups-inmutables | ransom | Backups inmutables (regla 3-2-1) | 4 | Copias offline probadas, restaurables sin depender del pago de rescate. |
| edr-aislamiento | ransom | EDR con aislamiento automático | 4 | Detecta y aísla endpoints comprometidos antes de que el ataque se propague. |
| gestion-parches | ransom | Gestión de parches automatizada | 3 | Reduce la ventana de exposición a vulnerabilidades conocidas. |
| plan-comunicacion-crisis | fake | Plan de comunicación de crisis | 2 | Canal oficial único para desmentir información falsa con rapidez. |
| monitoreo-marca | fake | Monitoreo de marca en redes | 2 | Detecta menciones anómalas o campañas de desinformación en etapa temprana. |
| verificacion-fuentes | fake | Protocolo de verificación de fuentes | 1 | Antes de reaccionar públicamente, se chequea origen, fecha y autor. |
| minimo-privilegio | cloud | Mínimo privilegio + auditoría de permisos | 3 | Revisión periódica de accesos y cuentas de servicio en la nube. |
| auditoria-proveedores | cloud | Auditoría de proveedores externos | 3 | Evalúa el riesgo de seguridad de terceros con acceso a tus sistemas. |
| escaneo-dependencias | cloud | Escaneo de dependencias (SBOM) | 2 | Verifica la integridad de librerías externas antes de actualizar. |
| plan-respuesta-incidentes | general | Plan de respuesta a incidentes | 4 | Reduce en 1 unidad el costo de emergencia de cualquier categoría. |

Categorías y su color de referencia (usar en las tres vistas, ya validado con el resto del
material del juego — mantiene todo consistente):

| categoria | color |
|---|---|
| phishing | azul `#185FA5` / fondo `#E6F1FB` |
| pass | violeta `#534AB7` / fondo `#EEEDFE` |
| social | coral `#993C1D` / fondo `#FAECE7` |
| ransom | rosa `#993556` / fondo `#FBEAF0` |
| fake | ámbar `#854F0B` / fondo `#FAEEDA` |
| cloud | verde azulado `#0F6E56` / fondo `#E1F5EE` |
| general | verde `#3B6D11` / fondo `#EAF3DE` |

## Rutas / páginas

### `GET /docente`
Panel del profesor. Requiere estar en la misma PC que corre el servidor (sin autenticación
por ahora — es Fase 1, la seguridad no es el objetivo todavía). Debe permitir:

- Ver la lista de equipos con su presupuesto y reputación actuales.
- Crear un equipo nuevo (nombre).
- Reiniciar la simulación completa (borra compras y registro_casos, resetea presupuesto y
  reputación de todos los equipos a 20/20). Pedir confirmación antes de ejecutar.
- Cargar el resultado de un caso: formulario simple con Equipo (select), Caso # (1-10), Ruta
  (select: Preventiva/Reactiva/Omisión), Δ Presupuesto (número, puede ser negativo), Δ
  Reputación (número, puede ser negativo), ¿Vulnerable? (checkbox). Al enviar, inserta en
  `registro_casos`, actualiza `equipos.presupuesto`/`equipos.reputacion`, y emite el evento de
  socket para que Proyector y Equipo se actualicen solos.
- Editar manualmente el presupuesto/reputación de un equipo (para corregir errores de carga).

### `GET /equipo`
Selector de equipo: lista de equipos existentes (botones grandes, pensado para tocar con el
dedo desde el celular). Al elegir uno, redirige a `/equipo/:id`. No hace falta contraseña —
es Fase 1, dentro de un aula controlada.

### `GET /equipo/:id`
Vista del equipo. Muestra:

- Nombre del equipo, presupuesto actual, reputación actual (grande, bien visible).
- El catálogo completo de herramientas, agrupado por categoría y coloreado según la tabla de
  arriba. Cada herramienta tiene un botón "Comprar". Si el equipo ya la tiene, el botón dice
  "Ya la tenés" y queda deshabilitado. Si no le alcanza el presupuesto, el botón queda
  deshabilitado con un texto tipo "Presupuesto insuficiente".
- Al comprar: llamada a `POST /api/equipos/:id/comprar` con `{ herramienta_id }`. El servidor
  valida presupuesto server-side (nunca confiar en el cliente), descuenta, inserta en
  `compras`, emite el evento de socket.
- Lista de herramientas ya compradas por el equipo.
- Se actualiza sola si otro integrante del mismo equipo compra algo desde otro dispositivo, o
  si el docente carga un resultado de caso para ese equipo.

### `GET /proyector`
Vista de solo lectura, pensada para pantalla grande / proyector. Muestra una tabla ordenada
por Puntaje descendente:

```
Puntaje = Reputación actual + Presupuesto actual / 2
```

Columnas: Puesto, Equipo, Presupuesto, Reputación, Puntaje. Se reordena sola en vivo a medida
que cambian los valores (animación simple de transición está bien, no es obligatoria). Fuente
grande, legible desde el fondo del aula.

## Eventos de WebSocket (Socket.io)

Un solo canal alcanza para esta fase: cualquier cambio de estado (compra, carga de caso,
reset, edición manual) emite `estado:actualizado` con el snapshot completo de equipos. Las
tres vistas simplemente vuelven a renderizar con lo que llega — no hace falta un evento por
tipo de acción, mantenerlo simple.

## Stack técnico

- Node.js + Express para el servidor HTTP.
- Socket.io para el tiempo real.
- `better-sqlite3` para la base (síncrona, simple, sin necesidad de ORM).
- Frontend: HTML + JS simple sin build step (nada de React/webpack) — server-rendered con
  plantillas simples (EJS o similar) o incluso HTML servido estático con `fetch` al cargar y
  Socket.io para las actualizaciones. Prioridad: que ande confiable en un celular viejo
  conectado a WiFi de aula, no elegancia de arquitectura.
- Sin autenticación en esta fase.

## Docker

`Dockerfile` + `docker-compose.yml` en la raíz. Un solo servicio (el server; SQLite es un
archivo, no necesita contenedor propio). El volumen de la base de datos debe persistir fuera
del contenedor (bind mount o volumen nombrado) para no perder los equipos si se reinicia el
contenedor a mitad de clase.

El puerto debe quedar expuesto en `0.0.0.0` (no solo `localhost`) para que otros dispositivos
de la misma red puedan conectarse a la IP local de la PC del docente.

Comando esperado para levantar todo: `docker compose up`.

## Fuera de alcance de esta fase (a propósito)

- Límite de presupuesto por ronda.
- Cronómetro automático / aplicación automática de la ruta Omisión al vencer el tiempo.
- Seguimiento de cuántas rondas lleva abierta una categoría vulnerable.
- Autenticación de equipos (PIN, login).
- Exportar a Excel (ya existe la planilla separada; se puede integrar después).
- Sonidos, animaciones elaboradas, temas visuales — funcional primero.

## Criterios de aceptación

- [ ] `docker compose up` levanta el servidor sin pasos manuales adicionales.
- [ ] Desde un celular en la misma WiFi, `/equipo` carga y permite elegir un equipo.
- [ ] Comprar una herramienta descuenta presupuesto correctamente y lo rechaza si no alcanza.
- [ ] El docente puede cargar el resultado de un caso desde `/docente` y se refleja al
      instante (sin F5) en `/proyector` y en `/equipo/:id` del equipo correspondiente.
- [ ] `/proyector` reordena el ranking en vivo cuando cambia el puntaje de cualquier equipo.
- [ ] Reiniciar la simulación desde `/docente` deja todo en el estado inicial (20/20, sin
      compras, sin registro de casos), después de confirmar.
- [ ] La base de datos persiste si se reinicia el contenedor.
