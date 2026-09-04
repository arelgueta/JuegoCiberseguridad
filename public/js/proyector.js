(function () {
  const socket = io();
  const tbody = document.getElementById('tabla-proyector');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatPuntaje(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function render(equipos) {
    const ordenados = [...equipos].sort((a, b) => b.puntaje - a.puntaje);
    tbody.innerHTML = ordenados
      .map(
        (eq, i) => `
      <tr>
        <td class="puesto">${i + 1}</td>
        <td>${escapeHtml(eq.nombre)}</td>
        <td>${eq.presupuesto}</td>
        <td>${eq.reputacion}</td>
        <td>${formatPuntaje(eq.puntaje)}</td>
      </tr>`
      )
      .join('');
  }

  socket.on('estado:actualizado', (data) => {
    render(data.equipos);
  });

  render(datosIniciales);
})();
