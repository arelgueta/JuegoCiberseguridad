(function () {
  const socket = io();
  const tbody = document.querySelector('#tabla-equipos tbody');
  const panelSesion = document.getElementById('panel-sesion');
  const mensajeEl = document.getElementById('mensaje');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);
  const sesionInicial = JSON.parse(document.getElementById('sesion-inicial').textContent);
  const casosInfo = JSON.parse(document.getElementById('casos-info').textContent);
  const casosPorNumero = new Map(casosInfo.map((c) => [c.numero, c]));

  let sesionActual = sesionInicial;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function mostrarMensaje(texto, tipo) {
    mensajeEl.textContent = texto;
    mensajeEl.className = 'mensaje ' + tipo;
    setTimeout(() => {
      mensajeEl.textContent = '';
      mensajeEl.className = '';
    }, 4000);
  }

  function renderEquipos(equipos) {
    tbody.innerHTML = '';
    for (const eq of equipos) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(eq.nombre)}</td>
        <td><input type="number" class="input-presupuesto" data-id="${eq.id}" value="${eq.presupuesto}"></td>
        <td><input type="number" class="input-reputacion" data-id="${eq.id}" value="${eq.reputacion}"></td>
        <td><button class="btn-guardar" data-id="${eq.id}" type="button">Guardar</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  tbody.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btn-guardar')) return;
    const id = e.target.dataset.id;
    const presupuesto = tbody.querySelector(`.input-presupuesto[data-id="${id}"]`).value;
    const reputacion = tbody.querySelector(`.input-reputacion[data-id="${id}"]`).value;
    const res = await fetch(`/api/equipos/${id}/editar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presupuesto: Number(presupuesto), reputacion: Number(reputacion) }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al editar el equipo.', 'error');
      return;
    }
    mostrarMensaje('Equipo actualizado.', 'exito');
  });

  document.getElementById('form-crear-equipo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const res = await fetch('/api/equipos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: form.nombre.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al crear el equipo.', 'error');
      return;
    }
    form.reset();
    mostrarMensaje('Equipo creado.', 'exito');
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('¿Reiniciar la partida? Mantiene los equipos, borra compras/casos y vuelve todo a 20/20.')) {
      return;
    }
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al reiniciar.', 'error');
      return;
    }
    mostrarMensaje('Partida reiniciada.', 'exito');
  });

  const inputConfirmarBorrar = document.getElementById('input-confirmar-borrar');
  const btnBorrarTodo = document.getElementById('btn-borrar-todo');
  inputConfirmarBorrar.addEventListener('input', () => {
    btnBorrarTodo.disabled = inputConfirmarBorrar.value !== 'BORRAR';
  });
  btnBorrarTodo.addEventListener('click', async () => {
    if (!confirm('¿BORRAR TODO? Esto elimina los equipos, no se puede deshacer.')) {
      return;
    }
    const res = await fetch('/api/borrar-todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmacion: inputConfirmarBorrar.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al borrar.', 'error');
      return;
    }
    inputConfirmarBorrar.value = '';
    btnBorrarTodo.disabled = true;
    mostrarMensaje('Todo borrado.', 'exito');
  });

  // --- Panel de sesión: sorteo, ronda activa/cronómetro, resumen editable, siguiente ronda ---

  function formatTiempo(segundos) {
    const s = Math.max(0, Math.ceil(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function segundosRestantes(sesion) {
    if (!sesion.rondaInicio) return 0;
    const inicio = new Date(sesion.rondaInicio).getTime();
    const transcurrido = (Date.now() - inicio) / 1000;
    return sesion.rondaDuracionSeg - transcurrido;
  }

  function tituloRonda(sesion) {
    if (sesion.rondaNumero === 0) {
      return 'Momento 0';
    }
    if (sesion.casoActivo) {
      return `Ronda ${sesion.rondaNumero} de ${sesion.totalRondas} — Caso #${sesion.casoActivo.numero}: ${sesion.casoActivo.titulo}`;
    }
    return `Ronda ${sesion.rondaNumero} de ${sesion.totalRondas}`;
  }

  function renderCasosSorteadosPreview(casosSorteados) {
    if (!casosSorteados || casosSorteados.length === 0) return '';
    const items = casosSorteados
      .map((numero, i) => {
        const info = casosPorNumero.get(numero);
        return `<li>Ronda ${i + 1}: Caso #${numero} — ${info ? escapeHtml(info.categoria) : ''} — ${info ? escapeHtml(info.titulo) : ''}</li>`;
      })
      .join('');
    return `<details class="casos-preview"><summary>Ver los 5 casos sorteados (los equipos no los ven)</summary><ol>${items}</ol></details>`;
  }

  function renderResumenEditable(resumen) {
    const filas = resumen
      .map(
        (item) => `
      <tr data-equipo-id="${item.equipoId}">
        <td>${escapeHtml(item.equipoNombre)}</td>
        <td>
          <select class="resumen-ruta">
            <option value="preventiva" ${item.ruta === 'preventiva' ? 'selected' : ''}>Preventiva</option>
            <option value="reactiva" ${item.ruta === 'reactiva' ? 'selected' : ''}>Reactiva</option>
            <option value="omision" ${item.ruta === 'omision' ? 'selected' : ''}>Omisión</option>
          </select>
        </td>
        <td><input type="number" class="resumen-presupuesto" value="${item.deltaPresupuesto}"></td>
        <td><input type="number" class="resumen-reputacion" value="${item.deltaReputacion}"></td>
        <td><input type="checkbox" class="resumen-vulnerable" ${item.vulnerable ? 'checked' : ''}></td>
      </tr>`
      )
      .join('');
    return `
      <table class="tabla-resumen">
        <thead><tr><th>Equipo</th><th>Ruta</th><th>Δ Presupuesto</th><th>Δ Reputación</th><th>¿Vulnerable?</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <button id="btn-confirmar-resumen" type="button">Confirmar resultados</button>
    `;
  }

  function renderPanelSesion(sesion) {
    sesionActual = sesion;
    let html = '';

    if (sesion.rondaEstado === 'inactiva') {
      html = `
        <div class="tarjeta-sesion">
          <p>La partida todavía no arrancó.</p>
          <form id="form-duracion" class="formulario">
            <label>Duración de ronda (seg)
              <input type="number" name="segundos" min="10" max="3600" value="${sesion.rondaDuracionSeg}">
            </label>
            <button type="submit">Guardar duración</button>
          </form>
          <button id="btn-sortear" type="button">Sortear y comenzar</button>
        </div>
      `;
    } else if (sesion.rondaEstado === 'finalizada') {
      html = `
        <div class="tarjeta-sesion finalizada">
          <p><strong>Partida finalizada.</strong> Mirá el ranking final en /proyector.</p>
        </div>
        ${renderCasosSorteadosPreview(sesion.casosSorteados)}
      `;
    } else if (sesion.rondaEstado === 'activa') {
      html = `
        <div class="tarjeta-sesion activa">
          <p class="titulo-ronda">${escapeHtml(tituloRonda(sesion))}</p>
          <p class="cronometro" id="cronometro">--:--</p>
          <button id="btn-cerrar-ronda" type="button">Cerrar ronda ahora</button>
        </div>
        ${renderCasosSorteadosPreview(sesion.casosSorteados)}
      `;
    } else if (sesion.rondaEstado === 'resuelta' && sesion.pendienteConfirmacion) {
      html = `
        <div class="tarjeta-sesion pendiente">
          <p class="titulo-ronda">${escapeHtml(tituloRonda(sesion))} — revisá antes de confirmar</p>
          ${renderResumenEditable(sesion.resolucionPendiente)}
        </div>
        ${renderCasosSorteadosPreview(sesion.casosSorteados)}
      `;
    } else if (sesion.rondaEstado === 'resuelta') {
      html = `
        <div class="tarjeta-sesion">
          <p>${escapeHtml(tituloRonda(sesion))} — resuelta.</p>
          <button id="btn-siguiente-ronda" type="button">Siguiente ronda</button>
        </div>
        ${renderCasosSorteadosPreview(sesion.casosSorteados)}
      `;
    }

    panelSesion.innerHTML = html;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error.', 'error');
      return null;
    }
    return data;
  }

  async function fetchSesion() {
    const res = await fetch('/api/sesion');
    const data = await res.json();
    renderPanelSesion(data);
  }

  panelSesion.addEventListener('submit', async (e) => {
    if (e.target.id === 'form-duracion') {
      e.preventDefault();
      const segundos = Number(e.target.segundos.value);
      const resultado = await postJSON('/api/sesion/duracion', { segundos });
      if (resultado) {
        mostrarMensaje('Duración guardada.', 'exito');
        await fetchSesion();
      }
    }
  });

  panelSesion.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-sortear') {
      const resultado = await postJSON('/api/sesion/sortear');
      if (resultado) mostrarMensaje('Partida sorteada, arrancó el Momento 0.', 'exito');
    } else if (e.target.id === 'btn-cerrar-ronda') {
      const resultado = await postJSON('/api/sesion/cerrar-ronda');
      if (resultado) mostrarMensaje('Ronda cerrada.', 'exito');
    } else if (e.target.id === 'btn-siguiente-ronda') {
      const resultado = await postJSON('/api/sesion/siguiente-ronda');
      if (resultado) mostrarMensaje('Siguiente ronda en marcha.', 'exito');
    } else if (e.target.id === 'btn-confirmar-resumen') {
      const filas = panelSesion.querySelectorAll('.tabla-resumen tbody tr');
      const ajustes = [...filas].map((fila) => ({
        equipoId: Number(fila.dataset.equipoId),
        ruta: fila.querySelector('.resumen-ruta').value,
        deltaPresupuesto: Number(fila.querySelector('.resumen-presupuesto').value),
        deltaReputacion: Number(fila.querySelector('.resumen-reputacion').value),
        vulnerable: fila.querySelector('.resumen-vulnerable').checked,
      }));
      const resultado = await postJSON('/api/sesion/confirmar', { ajustes });
      if (resultado) mostrarMensaje('Resultados confirmados.', 'exito');
    }
  });

  setInterval(() => {
    const el = document.getElementById('cronometro');
    if (!el || !sesionActual || sesionActual.rondaEstado !== 'activa') return;
    el.textContent = formatTiempo(segundosRestantes(sesionActual));
  }, 250);

  socket.on('estado:actualizado', (data) => {
    renderEquipos(data.equipos);
    fetchSesion();
  });

  renderEquipos(datosIniciales);
  renderPanelSesion(sesionInicial);
})();
