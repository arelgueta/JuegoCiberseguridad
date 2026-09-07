# BRECHA — servidor en vivo (Fase 4: autenticación)

Extiende todo lo anterior. Agrega contraseña de acceso al panel del docente y a cada equipo,
con sesiones que impiden que un equipo entre al panel de otro mientras dura la partida.

## Por qué esto cambia el resto

Desde `SPEC.md` hasta acá, cualquiera que supiera o adivinara la URL `/equipo/:id` de otro
equipo podía entrar a mirar su pantalla (no había nada que lo impidiera, solo la buena fe).
`SPEC4.md` ya había blindado la parte de **datos privados por socket** (la pista de
auditoría), pero no la navegación HTTP en sí. Esta fase cierra ese agujero de una vez, para
las dos superficies (HTTP y socket).

## Paquetes nuevos

- `express-session` — sesiones basadas en cookie, guardadas en memoria del proceso (alcanza
  para el uso de una clase; si el proceso se reinicia a mitad de partida, todos vuelven a
  tener que loguearse, lo cual es un costo aceptable para esta escala).
- `bcryptjs` — para hashear contraseñas. Se usa la variante pura en JavaScript (no `bcrypt`
  a secas) a propósito, para no depender de compilar un binding nativo dentro del contenedor
  Docker — menos cosas que puedan romperse en el build.

## Variables de entorno nuevas

```
DOCENTE_PASSWORD=<definir en el archivo .env local, nunca commitear>
SESSION_SECRET=<cualquier cadena larga y aleatoria, nunca commitear>
```

Agregar `.env` al `.gitignore` si todavía no está. `docker-compose.yml` debe leer estas
variables del entorno (`env_file: .env` o `environment:`), no tenerlas escritas adentro del
propio `docker-compose.yml` si ese archivo se commitea.

## Cambios en el modelo de datos

```sql
ALTER TABLE equipos ADD COLUMN password_hash TEXT NOT NULL;
```

El docente ya no puede crear un equipo solo con el nombre — el formulario de "Crear equipo"
en `/docente` (`SPEC.md`, Fase 1) suma un segundo campo obligatorio: contraseña del equipo.
El servidor la hashea con `bcryptjs` antes de guardarla — nunca se guarda en texto plano, ni
siquiera en la base local.

## Login del docente

- `GET /docente` — si la sesión no tiene `esDocente = true`, mostrar un formulario simple de
  contraseña en vez del panel (no redirigir a otra URL, para que sea un solo lugar).
- `POST /docente/login` con `{ password }` — comparar contra `process.env.DOCENTE_PASSWORD`
  (comparación simple, no hace falta hashear la del docente ya que es una sola y vive en una
  variable de entorno, no en la base). Si coincide: `req.session.esDocente = true`, servir el
  panel. Si no: mismo formulario con un error, sin dar pistas de por qué falló.
- Cualquier acción de `/docente` (crear equipo, sortear y comenzar, siguiente ronda, cargar
  resultado de caso, editar presupuesto, reset) debe validar `req.session.esDocente === true`
  server-side antes de ejecutar — no alcanza con ocultar los botones en el cliente.
- Agregar un botón de "Cerrar sesión" en el panel, que limpia `req.session.esDocente`.

## Login de equipo

- `GET /equipo` — selector de equipo (como ya existía), pero ahora al elegir un equipo pide
  contraseña antes de entrar, en vez de entrar directo.
- `POST /equipo/login` con `{ equipo_id, password }` — comparar con `bcryptjs.compare` contra
  el `password_hash` guardado. Si coincide: `req.session.equipoId = equipo_id`, redirigir a
  `/equipo/:id`. Si no: mismo formulario con error genérico ("equipo o contraseña
  incorrectos"), sin decir cuál de los dos falló.
- `GET /equipo/:id` — middleware que compara el `:id` de la URL con `req.session.equipoId`.
  Si no coinciden (o no hay sesión), no mostrar ese panel — redirigir al login de `/equipo`.
  Esto es lo que impide que un equipo entre a mirar el panel de otro escribiendo la URL a
  mano, aunque se sepa o se adivine el número de id.
- El endpoint de usar una herramienta (`POST /api/equipos/:id/comprar` o como se haya
  llamado en la implementación real) también debe validar `req.session.equipoId === id` —
  nunca confiar en que el `:id` de la URL sea el mismo equipo que está autenticado.
- Sesión válida "mientras dura la partida": no hace falta que expire por tiempo, simplemente
  dura lo que dura la cookie de sesión (hasta que cierren el navegador, limpien cookies, o el
  servidor se reinicie). No hace falta un botón de "cerrar sesión" para los equipos, aunque no
  molesta agregarlo igual por si un dispositivo se comparte entre dos personas del mismo
  equipo en momentos distintos.

## Socket.io — reforzar lo que ya pedía `SPEC4.md`

`SPEC4.md` decía "validar que la sala a la que se une un socket corresponde al id que
efectivamente está viendo esa pestaña", pero sin autenticación esa validación era débil (solo
dependía de qué URL cargó el navegador). Ahora hay que atarlo a la sesión real:

- Compartir la sesión de `express-session` con Socket.io (patrón habitual: envolver el
  middleware de sesión con `io.engine.use(...)`, disponible en Socket.io 4.6+, o con el
  paquete `express-socket.io-session` si la versión instalada es anterior).
- Al conectar un socket desde `/equipo/:id`, el servidor no debe confiar en un `id` que mande
  el cliente por el propio socket — debe leer `equipoId` de la sesión ya autenticada y unir
  el socket a `equipo:{ese id}`, ignorando cualquier otro valor que el cliente intente
  mandar.
- Las acciones de `/docente` que se disparan por socket (si las hay) deben validar
  `esDocente` de la sesión de la misma forma.

## Qué NO cambia

- `/proyector` y `/proyector-noticias` siguen sin login — son pantallas públicas para
  proyectar en el aula, no hace falta protegerlas.
- Todo lo demás (árbol de cartas, casos, cronómetro, easter egg) sigue exactamente igual.

## Criterios de aceptación

- [ ] `/docente` no muestra el panel sin loguearse primero con la contraseña correcta.
- [ ] Un `POST` directo a cualquier acción de docente (probar con `curl`, sin pasar por el
      login) es rechazado si no hay sesión válida.
- [ ] Crear un equipo nuevo exige contraseña, y esa contraseña queda guardada hasheada, nunca
      en texto plano (confirmar mirando la fila directamente en la base).
- [ ] Un equipo puede loguearse con su nombre y contraseña correctos y llega a su propio
      `/equipo/:id`.
- [ ] Ese mismo equipo, ya logueado, si edita la URL a mano para poner el `:id` de otro
      equipo, es redirigido al login — no ve el panel ajeno.
- [ ] Un socket conectado desde la sesión del Equipo A no puede terminar unido a la sala
      `equipo:B` aunque lo intente a propósito desde la consola del navegador.
- [ ] `/proyector` y `/proyector-noticias` siguen accesibles sin ningún login.
- [ ] El archivo `.env` con las contraseñas reales no está commiteado al repositorio (`git
      status` no debe mostrarlo si `.gitignore` está bien configurado).
