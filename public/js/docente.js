(function () {
  const socket = io();
  const tbody = document.querySelector('#tabla-equipos tbody');
  const selectEquipoCaso = document.getElementById('select-equipo-caso');
  const mensajeEl = document.getElementById('mensaje');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);

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

  function renderSelectEquipos(equipos) {
    const seleccionActual = selectEquipoCaso.value;
    selectEquipoCaso.innerHTML = '';
    for (const eq of equipos) {
      const opt = document.createElement('option');
      opt.value = eq.id;
      opt.textContent = eq.nombre;
      selectEquipoCaso.appendChild(opt);
    }
    if (seleccionActual && equipos.some((e) => String(e.id) === seleccionActual)) {
      selectEquipoCaso.value = seleccionActual;
    }
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
    renderSelectEquipos(equipos);
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

  document.getElementById('form-caso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      equipoId: Number(form.equipoId.value),
      casoNumero: Number(form.casoNumero.value),
      ruta: form.ruta.value,
      deltaPresupuesto: Number(form.deltaPresupuesto.value),
      deltaReputacion: Number(form.deltaReputacion.value),
      vulnerable: form.vulnerable.checked,
    };
    const res = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al cargar el caso.', 'error');
      return;
    }
    mostrarMensaje('Caso cargado.', 'exito');
    form.reset();
    form.deltaPresupuesto.value = 0;
    form.deltaReputacion.value = 0;
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('¿Reiniciar toda la simulación? Esto borra compras y casos, y vuelve todo a 20/20.')) {
      return;
    }
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'Error al reiniciar.', 'error');
      return;
    }
    mostrarMensaje('Simulación reiniciada.', 'exito');
  });

  socket.on('estado:actualizado', (data) => {
    renderEquipos(data.equipos);
  });

  renderEquipos(datosIniciales);
})();
