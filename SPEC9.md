# BRECHA — servidor en vivo (Fase 3, extras)

Extiende `SPEC8.md`. Dos agregados: un easter egg pensado para premiar a quien intente
"mirar detrás" del sistema (comportamiento deseable en una materia de seguridad), y una
asimetría deliberada entre categorías del árbol de nivel 3.

## Easter egg — el parámetro no documentado

En vez de un botón secreto o una ruta obviamente oculta, el hallazgo tiene que parecerse a
una vulnerabilidad real de las que se enseñan en la materia: **un parámetro de consulta no
documentado sobre un endpoint que ya existe**, el clásico "dejaron un flag de debug en
producción".

El endpoint que ya devuelve el catálogo filtrado de un equipo (`GET
/api/equipos/:id/catalogo`, definido implícitamente en `SPEC8.md` como parte de la lógica de
visibilidad) debe aceptar un query param extra, **no mencionado en ningún lado de la
interfaz ni de la documentación visible**: `?completo=1`.

- Sin el parámetro: comportamiento normal, devuelve solo las cartas visibles para ese equipo
  (como ya define `SPEC8.md`).
- Con `?completo=1`: devuelve el catálogo completo, sin filtrar por requisitos, **y agrega un
  campo extra** en la respuesta JSON:

```json
{
  "catalogo": [ /* las 33 cartas, todas, sin filtrar */ ],
  "secreto": "Vale por 20 unidades extra de presupuesto. Andá a buscar al profesor y decile la palabra clave: '¿qué se hace en un momento de tanta incertidumbre? ¿acaso debemos jugar al Mario Bros?'"
}
```

- No hay ningún link, botón ni mención de este parámetro en ninguna pantalla — quien lo
  encuentra, lo encuentra por su cuenta (mirando la pestaña de Red del navegador, leyendo el
  código fuente del cliente, probando parámetros comunes como `debug`, `full`, `admin`,
  `completo`, etc. — cualquier camino vale, es parte de la gracia).
- El campo `secreto` solo debe incluirse cuando se usa el parámetro — no debe aparecer nunca
  en la respuesta normal, ni siquiera vacío, para no delatar su existencia a quien no lo esté
  buscando activamente.
- El bonus de +20 presupuesto **no se aplica automáticamente**: es una recompensa que se
  canjea en persona con el docente, que ya tiene forma de editar el presupuesto de un equipo
  a mano desde `/docente` (`SPEC.md`, Fase 1) — no hace falta ninguna lógica nueva para
  otorgarlo, solo la frase y el hallazgo.

## Asimetría entre categorías

Reemplaza, solo para estas dos categorías, el efecto genérico de la rama 3-A que define
`SPEC8.md` ("+1 reputación extra"). El resto de las categorías (contraseñas, ingeniería
social, desinformación, nube) se mantienen exactamente como en `SPEC8.md`, sin cambios.

### Ransomware — `edr-aislamiento` (nivel 3-A)

Es la categoría con los costos y las penalizaciones más altas de todo el juego (nivel 2 a 4
de presupuesto, Omisión llega a -7/-5, el doble de la mayoría de las demás). Tiene sentido
que defenderse bien ahí valga más. Cambiar su efecto de recompensa de `+1` a **`+2`**
reputación extra al resolver Preventiva (total `+4` con el `+2` estándar).

### Auditoría — `auditoria-automatizacion-reportes` (nivel 3-A)

Esta categoría ya tiene un mecanismo propio distinto a las demás: su carta de nivel 2
(`programa-auditoria-interna`) dispara la pista privada de `SPEC4.md` (revela una categoría
al azar entre las pendientes de esa partida). Tiene más sentido que su rama de recompensa
profundice ese mecanismo en vez de darle la bonificación genérica de reputación que ya tienen
las demás categorías — sería una mejora redundante y menos interesante. Nuevo efecto:

> Si el equipo tiene `auditoria-automatizacion-reportes`, el efecto de
> `programa-auditoria-interna` cambia: en vez de revelar **una** categoría pendiente al azar,
> revela **dos**, distintas entre sí (si hay al menos dos pendientes disponibles; si solo
> queda una categoría pendiente, revela esa única igual que antes).

Esto no cambia nada de lo definido en `SPEC4.md` sobre cuándo se dispara la pista (al usar
`programa-auditoria-interna`) ni sobre su privacidad (sigue siendo visible solo para ese
equipo) — solo cambia cuántas categorías devuelve, condicional a tener también la carta de
nivel 3-A.

## Criterios de aceptación

- [ ] `GET /api/equipos/:id/catalogo` sin parámetros se comporta exactamente igual que en
      `SPEC8.md`.
- [ ] `GET /api/equipos/:id/catalogo?completo=1` devuelve las 33 cartas sin filtrar, más el
      campo `secreto` con el texto exacto de la consigna.
- [ ] El campo `secreto` nunca aparece en la respuesta normal (sin el parámetro).
- [ ] Ningún elemento de la interfaz (botón, link, texto de ayuda) menciona `completo=1` en
      ningún lugar — se confirma revisando el HTML/JS servido, no debe aparecer ni siquiera
      comentado.
- [ ] Un equipo con `edr-aislamiento` que resuelve un caso de ransomware como Preventiva
      recibe `+4` reputación total (`+2` estándar + `+2` de la rama), no `+3`.
- [ ] Un equipo con `auditoria-automatizacion-reportes` que usa
      `programa-auditoria-interna` recibe la pista con dos categorías (si hay al menos dos
      pendientes) en vez de una.
- [ ] Un equipo que tiene `programa-auditoria-interna` pero **no** tiene
      `auditoria-automatizacion-reportes` sigue recibiendo una sola categoría, como definía
      `SPEC4.md` originalmente.
