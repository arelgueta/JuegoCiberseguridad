# BRECHA — servidor en vivo (Fase 4, ajuste)

Extiende y corrige parte de `SPEC10.md`. Dos cambios: la contraseña del docente se registra
la primera vez que se abre `/docente`, en vez de venir de una variable de entorno; y la
contraseña de cada equipo se genera sola al crearlo, en vez de que el docente la escriba a
mano.

## Cambio 1 — la contraseña del docente se registra en el primer uso

Ya no hace falta `DOCENTE_PASSWORD` en el `.env`. Se reemplaza por una tabla que guarda el
hash una sola vez, la primera vez que alguien entra:

```sql
CREATE TABLE configuracion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  docente_password_hash TEXT
);
```

Arranca con una sola fila, `docente_password_hash = NULL` (sembrarla vacía al crear la base).

### Flujo en `/docente`

- Si `configuracion.docente_password_hash IS NULL`: mostrar una pantalla de **"Registrar
  contraseña"** (no de login) — pedirla dos veces (confirmación), validar que coincidan y que
  no esté vacía, hashearla con `bcryptjs` y guardarla en `configuracion`. Al confirmar, dejar
  la sesión ya autenticada (`req.session.esDocente = true`) y mostrar el panel directo, sin
  pedir que la vuelva a escribir.
- Si ya hay un hash guardado: mostrar el formulario de **login** normal que ya definía
  `SPEC10.md` — contraseña, comparar con `bcryptjs.compare`.
- **Se pierde la contraseña**: como se guarda hasheada, no hay forma de recuperarla ni
  mostrarla de nuevo. La salida simple para este contexto (no hace falta nada más
  sofisticado): borrar el valor directamente en la base
  (`UPDATE configuracion SET docente_password_hash = NULL WHERE id = 1`, con `sqlite3` desde
  la terminal) y volver a `/docente`, que va a pedir registrarla de cero.

### Qué se saca de `SPEC10.md`

- La variable de entorno `DOCENTE_PASSWORD` ya no es necesaria — sacarla del `.env` y de
  `docker-compose.yml`.
- `SESSION_SECRET` **se mantiene** — no es una contraseña de login, es la clave con la que se
  firman las cookies de sesión, cumple un rol distinto y sigue haciendo falta como variable
  de entorno, fuera del repositorio.

## Cambio 2 — contraseña de equipo autogenerada

El formulario de "Crear equipo" en `/docente` (`SPEC.md`/`SPEC10.md`) deja de tener un campo
de contraseña para escribir. Ahora solo pide el nombre; el servidor genera la contraseña.

### Generación

- 6 caracteres, mayúsculas y números, usando un alfabeto que evita caracteres que se
  confunden al leerlos en voz alta o escritos a mano: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (sin `O`, `0`, `I`, `1`, `L`).
- Se hashea con `bcryptjs` antes de guardarla en `equipos.password_hash`, igual que en
  `SPEC10.md` — la generación automática no cambia esa parte.

### Mostrarla al docente

- Al crear el equipo, la respuesta debe incluir la contraseña **en texto plano, una sola
  vez** — el servidor no la vuelve a tener disponible después (solo el hash queda guardado).
- En la pantalla de `/docente`, mostrar un aviso bien visible al lado del equipo recién
  creado con la contraseña en grande, más una nota tipo "Anotala o compartila ahora — no se
  va a poder volver a mostrar". No hace falta que persista en pantalla para siempre, pero sí
  el tiempo suficiente como para que el docente la lea en voz alta o la escriba en el
  pizarrón sin apuro (por ejemplo, dejarla visible hasta que el docente cree el próximo
  equipo o navegue a otra sección, lo que pase después).

### Reemplazo de contraseña

Agregar un botón "Generar nueva contraseña" junto a cada equipo ya existente en la tabla de
`/docente`, para el caso de que la primera no se haya podido anotar a tiempo o el equipo la
haya perdido. Mismo comportamiento: genera una nueva, la muestra una sola vez, sobreescribe
el hash anterior (la vieja deja de servir).

## Qué NO cambia

- El resto de `SPEC10.md` (login de equipo con nombre+contraseña, sesión por `equipoId`,
  bloqueo de URL ajena, sockets atados a la sesión) sigue exactamente igual — lo único que
  cambia es de dónde sale cada contraseña, no cómo se usan después.

## Criterios de aceptación

- [ ] La primera vez que se abre `/docente` en una base nueva, pide registrar una contraseña
      (dos veces) en vez de pedir login.
- [ ] Después de registrarla, volver a abrir `/docente` (por ejemplo en otra pestaña o tras
      reiniciar el contenedor) pide login normal, no registro de nuevo.
- [ ] Crear un equipo no tiene ningún campo de contraseña en el formulario — el docente solo
      escribe el nombre.
- [ ] Al crear el equipo, aparece la contraseña generada en texto plano en algún lugar visible
      de `/docente`, y esa contraseña permite loguearse correctamente desde `/equipo`.
- [ ] Consultando la base directamente, `equipos.password_hash` nunca contiene la contraseña
      en texto plano, solo el hash.
- [ ] El botón "Generar nueva contraseña" invalida la anterior — loguearse con la vieja deja
      de funcionar apenas se genera la nueva.
- [ ] `DOCENTE_PASSWORD` ya no aparece en ningún lado del `.env` de ejemplo ni del
      `docker-compose.yml`. `SESSION_SECRET` sigue presente.
