# JuegoCiberseguridad

BRECHA — servidor en vivo para la simulación de ciberseguridad de clase. El detalle funcional
está repartido en [SPEC.md](SPEC.md) (Fase 1: MVP), [SPEC2.md](SPEC2.md) (Fase 2: rondas con
cronómetro), [SPEC3.md](SPEC3.md) (sorteo de casos y Momento 0, reemplaza el cierre especial de
auditoría de SPEC2), [SPEC4.md](SPEC4.md) (pista privada de auditoría vía salas de Socket.io) y
[SPEC5.md](SPEC5.md) (catálogo sin restricción de ronda, categoría "políticas" y segundo
proyector de noticias), [SPEC6.md](SPEC6.md) (grilla 2x2 con 2 pistas por caso, bloqueo de
cartas entre rondas, bienvenida por equipo en la Ronda 0), [SPEC7.md](SPEC7.md) (corrige
SPEC6: el acento visual de las noticias indica de dónde viene la información, no cuál es la
pista real; reemplaza por completo el contenido de noticias de SPEC5/SPEC6), [SPEC8.md](SPEC8.md)
(Fase 3: árbol de desbloqueo de 3 niveles por categoría, 33 cartas, presupuesto inicial 30) y
[SPEC9.md](SPEC9.md) (extras de Fase 3) — cada documento extiende o corrige al anterior, en
ese orden.

## Uso

```
docker compose up
```

Levanta el servidor en `http://localhost:3000` (y en la IP de la PC del docente dentro de la
WiFi del aula, por ejemplo `http://192.168.1.50:3000`).

- `/docente` — panel del profesor.
- `/equipo` — selector de equipo, para abrir desde el celular.
- `/proyector` — ranking en vivo, para conectar al cañón.
- `/proyector-noticias` — segundo proyector (o segunda ventana) con las noticias del caso
  activo, para conectar a un segundo cañón si hay uno disponible.

Los datos se guardan en `./data/brecha.sqlite`, que persiste aunque se reinicie el contenedor.

## Desarrollo sin Docker

```
npm install
npm start
```
