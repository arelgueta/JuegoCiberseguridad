# BRECHA — servidor en vivo (Fase 2, corrección + segundo proyector)

Extiende `SPEC3.md`/`SPEC4.md`. Tres cambios en este documento: corrige un error de diseño
propio sobre las cartas de "Momento 0", y agrega un segundo proyector de noticias estático
por caso. Se pensaron para probarse juntos en la misma tanda.

**Nota importante si ya se leyó una versión anterior de este documento**: una versión previa
de este archivo decía que la Ronda 0 dejaba de existir como fase distinta. Eso estaba mal.
Esta versión lo corrige: **la Ronda 0 se mantiene exactamente como la definió `SPEC3.md`** —
siempre existe, siempre es la primera ronda de la partida, con su propio cronómetro. Lo único
que cambia acá es qué cartas se pueden usar y en qué momento, no la existencia de la ronda.

## Cambio 1 — renombrar la categoría

`fundacion` pasa a llamarse `politicas`. Actualizar:

- El valor de `categoria` en las 4 filas de `herramientas` correspondientes
  (`relevamiento-ti`, `gestion-riesgos`, `siem`, `comite-gobierno`).
- El encabezado de sección en `/equipo/:id` (donde decía "Momento 0" en la captura, debe decir
  "Políticas").
- Cualquier referencia en el código a `fundacion` como nombre de categoría.

El color se mantiene (gris `#5F5E5A` / fondo `#F1EFE8`).

## Cambio 2 — el catálogo completo queda siempre disponible, en toda ronda

Esto es lo que realmente había que corregir, y aplica a **todas** las categorías, no solo a
`politicas`: ninguna carta del catálogo debe estar restringida a una ronda en particular.

- Durante la Ronda 0 (antes de que arranque el primer caso sorteado): el equipo puede usar
  **cualquier** carta del catálogo completo — políticas, phishing, ransomware, todas — no
  solo las 4 de políticas. Es lógico: en la vida real, una empresa no arranca comprando solo
  políticas y nada más, arranca invirtiendo donde crea que más lo necesita, a ciegas.
- Durante las rondas 1 a 5 (con un caso activo): el equipo sigue pudiendo usar **cualquier**
  carta del catálogo en cualquier momento, además de la mecánica de "Reaccionar" específica
  del caso activo que ya define `SPEC2.md`/`SPEC3.md`. Comprar una herramienta de una
  categoría que no tiene nada que ver con el caso de esa ronda es una decisión de
  anticipación del equipo (capaz sospechan qué viene, o simplemente están cubriendo huecos) —
  el sistema no debe impedirlo.
- Eliminar el texto "Disponible solo en el Momento 0" de la interfaz, y cualquier validación
  server-side que rechace el uso de una carta por estar "fuera de su ronda". La única
  restricción que se mantiene es la dependencia entre cartas ya definida en `SPEC3.md`:
  `gestion-riesgos` sigue requiriendo tener `relevamiento-ti` primero — eso es un
  prerrequisito entre cartas, no una restricción de ronda, y sigue vigente sin cambios.

## Qué NO cambia (para que quede claro después de la confusión de la versión anterior)

- La Ronda 0 sigue siendo siempre la primera ronda de toda partida, sin excepción.
- La Ronda 0 sigue teniendo su propio cronómetro, controlado por "Sortear y comenzar" para
  abrirla y "Siguiente ronda" para cerrarla y pasar al primer caso sorteado — igual que
  describe `SPEC3.md`.
- La Ronda 0 sigue siendo la única ronda sin un caso/incidente activo — por eso ahí no hay
  mecánica de "Reaccionar", solo compra libre del catálogo completo.
- El sorteo de 5 casos de los 10 disponibles, y todo lo demás de `SPEC3.md` y `SPEC4.md`
  (pista de auditoría, salas privadas, etc.), sigue exactamente igual.

## Cambio 3 — segundo proyector de noticias (estático, sin mezcla)

Una segunda pantalla, pensada para un segundo cañón o una segunda ventana en el mismo
monitor, que muestra las noticias del mundo correspondientes al caso que está por resolverse
o resolviéndose, todas juntas en una sola pantalla, sin navegación de diapositiva en
diapositiva.

**Decisión de diseño clave, a pedido explícito**: las noticias son **estáticas por caso**, no
se sortean ni se mezclan entre categorías. Cada uno de los 10 casos tiene siempre las mismas
4 noticias fijas asociadas a su número. Como el sorteo de `SPEC3.md` garantiza que cada caso
aparece **como mucho una vez por partida**, esto alcanza para que ninguna noticia se repita
dentro de una misma partida, sin necesidad de ningún sistema de selección aleatoria.

### Tabla nueva: noticias

```sql
CREATE TABLE noticias (
  id INTEGER PRIMARY KEY,
  caso_numero INTEGER NOT NULL REFERENCES casos(numero),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  es_pista INTEGER NOT NULL DEFAULT 0   -- 1 = coincide con la categoría real del caso, 0 = señuelo
);
```

Semilla: reutilizar tal cual el contenido de 4 noticias por caso que ya existe en el archivo
de diapositivas (`brecha-diapositivas.html`, array `noticiasPorCaso`), re-indexado por
**número de caso** en vez de por posición (`noticiasPorCaso[0]` → `caso_numero = 1`, y así
sucesivamente hasta `noticiasPorCaso[8]` → `caso_numero = 9`). El bloque que estaba en
`noticiasPorCaso[9]` (antes asociado al viejo "caso 10 — auditoría final") hay que
reescribirlo para que encaje con el nuevo caso 10 (`SPEC3.md`, "Auditoría de cumplimiento sin
previo aviso"), por ejemplo:

| tipo | titulo | descripcion |
|---|---|---|
| pista | Reguladores anuncian inspecciones de cumplimiento sin aviso previo | Distintos organismos comenzarán a realizar auditorías sorpresa para verificar el cumplimiento de normas de seguridad, sin notificar la fecha con anticipación. |
| señuelo | Alertan sobre fraudes de suplantación de correo corporativo | Se reporta un nuevo repunte de casos de BEC dirigidos a pequeñas y medianas empresas. |
| señuelo | Documentan nuevas estafas telefónicas con voz clonada por IA | Los casos reportados muestran variantes cada vez más difíciles de distinguir de una llamada real. |
| señuelo | Un proveedor de nube anuncia nuevas certificaciones de seguridad | La empresa busca reforzar la confianza de sus clientes empresariales tras incidentes recientes en el sector. |

El resto de los 9 bloques (casos 1 a 9) se copian sin cambios de contenido, solo cambia cómo
se indexan.

### Vista `/proyector-noticias`

- Se sincroniza con el mismo estado público de sesión que ya usa `/proyector` (ronda activa,
  cronómetro) — no hace falta un canal de socket aparte, es información pública.
- Mientras `ronda_numero == 0` (Ronda 0, sin caso activo): mostrar un estado neutro, por
  ejemplo "Los equipos están decidiendo su inversión inicial" — sin noticias todavía.
- Mientras hay un caso activo (rondas 1 a 5): mostrar las 4 noticias de `noticias` para ese
  `caso_numero`, **todas juntas en una sola pantalla** (grilla o lista, no carrusel), más el
  cronómetro de la ronda corriendo al lado o arriba — mismo cálculo de cuenta regresiva que
  ya usa `/equipo/:id` (a partir de `ronda_inicio`, no un contador propio del cliente).
- **No mostrar** en esta pantalla cuál noticia es `es_pista = 1` y cuál no — esa distinción
  es justamente lo que los equipos tienen que discutir por su cuenta. El campo existe en la
  base para que el docente lo pueda consultar aparte si quiere (por ejemplo, agregándolo como
  información adicional en `/docente`, no en esta pantalla pública), pero en
  `/proyector-noticias` las 4 se muestran con el mismo formato visual, sin ninguna marca que
  las diferencie.
- Después de la ronda 5, mismo estado de "Partida finalizada" que ya define `SPEC3.md` para
  `/proyector`.

## Criterios de aceptación

- [ ] Toda partida nueva arranca con una Ronda 0 (verificar que no se pueda saltear).
- [ ] Durante la Ronda 0, el catálogo muestra las 8 categorías completas (7 de amenaza +
      políticas), todas usables, no solo políticas.
- [ ] Durante una ronda con caso activo (1 a 5), un equipo puede usar una carta de cualquier
      categoría — no solo la del caso activo — además de poder "Reaccionar" al caso puntual.
- [ ] `gestion-riesgos` sigue bloqueada sin `relevamiento-ti`, en cualquier ronda.
- [ ] No queda ningún texto ni lógica que diga "Disponible solo en el Momento 0" o
      equivalente para ninguna categoría.
- [ ] La sección del catálogo dice "Políticas", no "Momento 0", en el encabezado.
- [ ] `/proyector-noticias` muestra las 4 noticias del caso activo juntas en una sola
      pantalla, sin navegación de a una.
- [ ] Ninguna noticia se repite dentro de una misma partida (se desprende de que cada caso
      sale como mucho una vez en el sorteo — pero vale la pena confirmarlo jugando una
      partida completa de punta a punta).
- [ ] `/proyector-noticias` no revela visualmente cuál noticia es la pista real.
- [ ] El cronómetro en `/proyector-noticias` coincide, segundo a segundo, con el que ve cada
      equipo en su celular.
