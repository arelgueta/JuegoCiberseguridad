# BRECHA — servidor en vivo (Fase 2, v3)

Extiende `SPEC3.md`. No reemplaza nada de lo anterior, agrega la pista real de la carta de
auditoría interna.

## Vocabulario (para que no haya ambigüedad en el código ni en los nombres de variables)

- **Categoría**: una de las 7 familias de amenaza — `phishing`, `pass`, `social`, `ransom`,
  `fake`, `cloud`, `auditoria`. Fija, no cambia entre partidas.
- **Caso**: un escenario concreto (hay 10 en total, algunas categorías tienen más de un caso
  — por ejemplo `ransom` tiene el caso 4 y el caso 8). De los 10 casos, cada partida sortea y
  juega solo 5.

## Requisito nuevo: salas privadas por equipo (Socket.io rooms)

Hasta ahora (Fase 1 y `SPEC2`/`SPEC3`) todo evento de socket es público — cualquier vista que
esté escuchando recibe el mismo snapshot. Eso sigue estando bien para el estado general
(presupuesto, reputación, ronda activa, ranking), pero la pista de auditoría es información
que **un equipo no debe poder ver de otro**, así que hace falta separar canales:

- Cuando `/equipo/:id` se conecta por socket, debe unirse a una sala llamada `equipo:{id}`
  (`socket.join(`equipo:${id}`)`).
- Eventos públicos (como hasta ahora): `io.emit(...)`, llegan a todos.
- Eventos privados nuevos (como la pista de auditoría): `io.to(`equipo:${id}`).emit(...)`,
  llegan solo a los dispositivos conectados a la vista de ese equipo.
- Como puede haber más de un integrante del mismo equipo conectado desde distintos celulares,
  todos los que estén viendo `/equipo/:id` reciben la pista — es correcto, es información del
  equipo, no de una persona.

## Tabla nueva: pistas_auditoria

```sql
CREATE TABLE pistas_auditoria (
  equipo_id INTEGER PRIMARY KEY REFERENCES equipos(id),
  categoria_sugerida TEXT,     -- una de las 7 categorías, o NULL si no había nada pendiente
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Una fila por equipo, se crea en el momento en que ese equipo usa la carta
`programa-auditoria-interna` (no antes — no tiene sentido precalcularla).

## Lógica al usar `programa-auditoria-interna`

Además de lo que ya hace cualquier uso de herramienta (descontar presupuesto, quedar
marcada como "ya la estás utilizando"), disparar esto:

1. Mirar `sesion.casos_sorteados` y `sesion.ronda_numero` para saber qué casos de la tanda de
   ese equipo **todavía no se jugaron** (posiciones del array con índice mayor o igual a la
   ronda actual, si la ronda actual ya está resuelta, o mayor a la ronda actual si está en
   curso — en criollo: los casos que faltan, sin contar el que se está jugando ahora mismo).
2. De esos casos pendientes, sacar sus categorías, sacar duplicados, y **excluir
   `auditoria`** de la lista (si el caso de auditoría todavía no se jugó, no tiene sentido que
   la pista sea "reforzá auditoría" comprando justamente la carta de auditoría).
3. Si queda al menos una categoría en la lista: elegir una al azar. Guardarla en
   `pistas_auditoria.categoria_sugerida` para ese equipo. Emitir un evento privado a
   `equipo:{id}` con el texto de la recomendación.
4. Si no queda ninguna (por ejemplo, el único caso pendiente es justo el de auditoría, o ya
   se jugaron los otros 4): guardar `categoria_sugerida = NULL` y emitir igual el evento,
   pero con un mensaje distinto tipo "La auditoría interna no encontró exposiciones
   pendientes por reforzar" — no debe romper ni quedar en blanco.

Esta selección se hace **una sola vez**, en el momento de usar la carta (no se recalcula
después, aunque cambien cosas más adelante en la partida — es una foto del momento en que se
compró, que es como funcionaría una auditoría real).

## Vista `/equipo/:id` — mostrar la pista

A diferencia del feedback de resultado de caso (`SPEC2.md`, un toast que aparece y
desaparece), esta pista es información que el equipo va a querer seguir consultando mientras
decide qué comprar más adelante. Debe quedar **fija y visible** en algún lugar de la pantalla
del equipo (no un toast que se cierra solo) desde el momento en que se revela hasta el final
de la partida — por ejemplo, una tarjeta chica con el ícono/color de la categoría sugerida y
el texto de la recomendación, ubicada cerca del catálogo de herramientas para que sea fácil
de tener en cuenta al decidir la próxima compra.

Si `categoria_sugerida` es NULL, mostrar el mensaje alternativo del punto 4 de arriba, con el
mismo estilo visual pero neutro (sin color de categoría).

## Qué NO debe pasar

- El proyector nunca debe mostrar ni insinuar la pista de ningún equipo — ni la categoría
  sugerida, ni siquiera si un equipo tiene o no tiene pista (eso ya se filtra solo si el
  proyector no se suscribe a `equipo:{id}`, pero vale la pena decirlo explícito para que no
  se filtre por error en un snapshot general).
- Un equipo no debe poder ver la pista de otro equipo aunque adivine o escriba en la URL el
  `id` de otro equipo — validar server-side que la sala a la que se une un socket corresponde
  al `id` que efectivamente está viendo esa pestaña (esto ya debería cumplirse naturalmente
  si `/equipo/:id` conecta el socket con el `id` de la URL, pero conviene decirlo como
  criterio de aceptación explícito).

## Criterios de aceptación

- [ ] Al usar `programa-auditoria-interna`, solo el equipo que la usó ve la recomendación —
      probarlo con dos pestañas abiertas de equipos distintos, confirmar que la segunda no
      recibe nada.
- [ ] La categoría sugerida nunca es `auditoria`.
- [ ] La categoría sugerida siempre corresponde a un caso todavía no jugado de la tanda
      sorteada de ese equipo.
- [ ] Si no queda ninguna categoría elegible, se muestra el mensaje alternativo en vez de
      romper o quedar vacío.
- [ ] La pista queda visible en la pantalla del equipo durante el resto de la partida, no
      desaparece sola como el toast de resultado de caso.
- [ ] El proyector no expone en ningún momento la pista de ningún equipo.
- [ ] Un socket conectado a `/equipo/:id` no puede recibir eventos de la sala de otro `id`
      aunque lo intente a propósito (probarlo abriendo la consola del navegador e intentando
      unirse manualmente a otra sala, si el docente quiere validar esto a fondo — opcional
      pero recomendable dado que es la primera vez que el sistema maneja algo privado).
