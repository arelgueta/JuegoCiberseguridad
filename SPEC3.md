# BRECHA — servidor en vivo (Fase 2, v2)

Este documento **reemplaza** la sección "Caso especial: auditoría final" de `SPEC2.md`, y
extiende el resto de esa fase (ronda activa, cronómetro automático, reaccionar a tiempo,
vulnerabilidad con duplicado, override del docente, reset de dos niveles) tal cual estaba.
Si `SPEC2.md` ya se implementó parcialmente, este documento es la versión a seguir a partir
de ahora para todo lo relacionado a la selección de casos y el Momento 0.

## Qué cambia

1. La auditoría deja de ser un cierre fijo y especial. Pasa a ser **una categoría más**
   (`auditoria`), con su propio caso regular y su propia carta preventiva — se resuelve
   exactamente igual que cualquier otro caso (Preventiva / Reactiva / Omisión).
2. Ya no se juegan los 10 casos en orden fijo. Al arrancar la partida, el servidor **sortea 5
   casos de los 10 disponibles y los baraja** — cada partida es distinta.
3. Se agrega el **Momento 0**: una ronda fija, siempre primera, siempre igual, donde los
   equipos deciden a ciegas (sin saber qué casos les van a tocar) en qué invertir usando 4
   cartas nuevas. No entra en el sorteo.
4. Total: **6 rondas** — Momento 0 + 5 casos sorteados.
5. En toda la interfaz, "Comprar" pasa a llamarse **"Utilizar"** (botón, textos de estado,
   historial). El campo `costo` y la mecánica de descuento de presupuesto no cambian, solo el
   verbo — usar una carta sigue costando presupuesto igual que antes.

## Categoría nueva: auditoria

Se agrega a la tabla de categorías/colores existente:

| categoria | color |
|---|---|
| auditoria | rojo `#A32D2D` / fondo `#FCEBEB` |
| fundacion (Momento 0, no es una categoría de amenaza) | gris `#5F5E5A` / fondo `#F1EFE8` |

### Nueva herramienta del catálogo regular

| id | categoria | nombre | costo | descripcion |
|---|---|---|---|---|
| programa-auditoria-interna | auditoria | Programa de auditoría interna | 3 | Revisiones periódicas que detectan y corrigen brechas antes de que las encuentre un auditor externo. |

### Caso 10 (ahora regular, ya no especial)

Reemplaza al viejo "caso 10 — auditoría final". Se resuelve con el mismo flujo que cualquier
otro caso de `SPEC2.md` (Preventiva/Reactiva/Omisión, sin lógica dedicada):

| numero | categoria | titulo | costo_reactiva | omision_presupuesto | omision_reputacion |
|---|---|---|---|---|---|
| 10 | auditoria | Auditoría de cumplimiento sin previo aviso | 4 | -4 | -5 |

Eliminar de `SPEC2.md`/del código toda referencia a `especial = 'auditoria_final'` y a la
lógica de "revisar las 6 categorías del equipo" — ya no existe ese camino especial.

## Momento 0

### Cartas nuevas (categoria = `fundacion`)

| id | nombre | costo | requiere | efecto |
|---|---|---|---|---|
| relevamiento-ti | Relevamiento de TI | 2 | — | Sin efecto propio en presupuesto/reputación. Habilita comprar `gestion-riesgos`. |
| gestion-riesgos | Gestión de riesgos | 3 | `relevamiento-ti` | Mientras el equipo la tenga: todo delta de Omisión (presupuesto y reputación, en cualquier categoría) se reduce un 30%, redondeando hacia 0 (menos negativo). Se aplica **antes** de evaluar si corresponde duplicar por vulnerabilidad repetida. |
| siem | Incorporación de SIEM | 4 | — | Mientras el equipo la tenga: cualquier caso que le habría resuelto en Omisión (no tiene la herramienta preventiva de esa categoría, y no llegó a reaccionar a tiempo) se resuelve como Reactiva **sin cobrar** el costo de emergencia, en vez de aplicar la penalización de Omisión. |
| comite-gobierno | Comité de gobierno de seguridad | 2 | — | Mientras el equipo la tenga: el efecto de "duplicar" por categoría vulnerable repetida (ver `SPEC2.md`) nunca se aplica para ese equipo — cada Omisión pega como si fuera la primera vez en esa categoría. |

### Orden de aplicación cuando un equipo tiene varias de estas activas

Al resolver una ronda para un equipo que terminaría en Omisión, aplicar en este orden:

1. ¿Tiene `siem`? → se resuelve como Reactiva gratis. Fin, no seguir evaluando lo de abajo.
2. Si no tiene `siem` (se mantiene la Omisión): calcular el delta base de la tabla de casos.
3. ¿La categoría ya estaba vulnerable? → duplicar el delta, **salvo** que el equipo tenga
   `comite-gobierno`, en cuyo caso no se duplica.
4. ¿Tiene `gestion-riesgos`? → reducir el resultado (ya duplicado o no) un 30%.
5. Aplicar el delta final y, si corresponde, marcar/mantener la categoría como vulnerable.

### Bloqueo de dependencia

`gestion-riesgos` debe aparecer deshabilitada en `/equipo/:id` (con un texto tipo "Primero
necesitás Relevamiento de TI") hasta que el equipo tenga `relevamiento-ti` en su historial de
uso. Validar también server-side en el endpoint de uso — nunca confiar solo en que el botón
esté deshabilitado en el cliente.

### Flujo del Momento 0

- Es la ronda 0 de la partida, siempre la primera, siempre con las mismas 4 cartas.
- Corre con cronómetro igual que las demás rondas (mismo `ronda_duracion_seg` de la sesión).
- A diferencia de los casos normales, no hay "caso" que resolver al cerrar: los equipos ya
  fueron descontando presupuesto en tiempo real a medida que usaban cada carta (igual que el
  flujo de catálogo de Fase 1). Al vencer el cronómetro o cuando el docente cierra la ronda,
  simplemente se congela la posibilidad de seguir usando cartas de `fundacion` y se pasa a
  sortear/arrancar la ronda 1.

## Sorteo de casos

### Cambios en `sesion`

```sql
ALTER TABLE sesion ADD COLUMN casos_sorteados TEXT;  -- JSON: array de 5 números de caso, en el orden a jugar
ALTER TABLE sesion ADD COLUMN ronda_numero INTEGER NOT NULL DEFAULT 0;  -- 0 = Momento 0, 1..5 = índice en casos_sorteados
```

### Acción del docente: "Sortear y comenzar"

Reemplaza al primer "Siguiente caso" de `SPEC2.md`. Al presionarla:

1. Elegir 5 números distintos al azar entre los 10 casos disponibles (1 a 10, incluye el
   nuevo caso de auditoría en igualdad de condiciones con el resto).
2. Barajar el orden de esos 5.
3. Guardar en `sesion.casos_sorteados` (JSON), `ronda_numero = 0`, `ronda_estado = 'activa'`,
   `ronda_inicio = ahora`.
4. Emitir el evento de socket. Todas las vistas entran al Momento 0.

### Acción del docente: "Siguiente ronda"

Reemplaza al resto de los "Siguiente caso" de `SPEC2.md`:

- Si `ronda_numero == 0` (veníamos del Momento 0): pasa a `ronda_numero = 1`, caso activo =
  `casos_sorteados[0]`.
- Si `1 <= ronda_numero < 5`: incrementa, caso activo = `casos_sorteados[ronda_numero]` (con
  el índice correspondiente).
- Si `ronda_numero == 5` (se acaba de resolver la quinta y última): la partida termina. No
  hay más "siguiente" — mostrar en `/docente` y `/proyector` un estado de "Partida
  finalizada" con el ranking final destacado.

No hay que decirle a los equipos, al empezar, cuáles son los 5 casos que les tocaron ni en
qué orden — eso es parte de la incertidumbre del Momento 0. `/docente` sí puede mostrar la
lista completa de antemano, para que el profesor sepa qué viene y pueda leer los casos con
comodidad.

### Reset

Al "Reiniciar partida" (ver `SPEC2.md`), limpiar también `casos_sorteados` y volver
`ronda_numero` a 0 — la próxima partida sortea de nuevo, no repite el mismo orden.

## Renombrar "Comprar" → "Utilizar"

Cambiar en toda la interfaz (botones, mensajes de estado, historial, cualquier copy visible),
tanto para el catálogo regular como para las cartas de Momento 0:

| Antes | Ahora |
|---|---|
| "Comprar" (botón) | "Utilizar" |
| "Ya la tenés" | "Ya la estás utilizando" |
| "Presupuesto insuficiente" | (se mantiene igual, no es parte del verbo comprar/utilizar) |
| Endpoint `POST /api/equipos/:id/comprar` | puede mantenerse igual en el código (es un detalle interno, no hace falta romper la API por esto) — el renombrado es de cara al usuario, no del nombre técnico de la ruta, salvo que Claude Code prefiera alinearlo por prolijidad. |

## Criterios de aceptación (agregado a los de SPEC2.md)

- [ ] Al presionar "Sortear y comenzar", se eligen 5 casos distintos al azar de los 10 y se
      guardan barajados; dos partidas seguidas no deberían dar el mismo orden (probarlo
      corriendo el sorteo varias veces y verificando que varía).
- [ ] El Momento 0 muestra únicamente las 4 cartas de `fundacion`, con cronómetro, y
      `gestion-riesgos` deshabilitada hasta tener `relevamiento-ti`.
- [ ] El intento de usar `gestion-riesgos` sin `relevamiento-ti` es rechazado también del lado
      del servidor, no solo oculto en la interfaz.
- [ ] Un equipo con `siem` que cae en un caso sin cobertura queda en Reactiva sin que se le
      cobre el costo de emergencia.
- [ ] Un equipo con `comite-gobierno` nunca sufre el duplicado por vulnerabilidad repetida.
- [ ] Un equipo con `gestion-riesgos` ve sus penalizaciones de Omisión reducidas un 30%
      (verificar con un caso conocido y calcular a mano el valor esperado).
- [ ] Después de la quinta ronda sorteada, el juego marca "Partida finalizada" y no ofrece un
      "Siguiente ronda" más.
- [ ] En toda la interfaz visible dice "Utilizar", no "Comprar".
- [ ] El caso de auditoría (categoría `auditoria`) se resuelve con el flujo normal, sin ningún
      camino de código especial para él.
