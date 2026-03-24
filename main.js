const alumnos = ["Juan", "Maria", "David", "Nuria", "Paco", "Richard", "Dani", "Marta", "Maite", "Clara"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emparejar() {
  const tam = parseInt(document.getElementById('slider').value);
  const mezclados = shuffle(alumnos);
  const grupos = [];
  for (let i = 0; i < mezclados.length; i += tam) grupos.push(mezclados.slice(i, i + tam));

  let html = `<div class="stats">
    <div class="stat"><div class="stat-label">Grupos</div><div class="stat-value">${grupos.length}</div></div>
    <div class="stat"><div class="stat-label">Por grupo</div><div class="stat-value">${tam}</div></div>
    <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${alumnos.length}</div></div>
  </div><div id="grupos">`;

  grupos.forEach((g, i) => {
    const delay = i * 60;
    html += `<div class="grupo-card" style="animation-delay:${delay}ms">
      <div class="grupo-titulo">Grupo ${i + 1}</div>
      <div class="chips">${g.map((n, j) => `<span class="chip" style="animation-delay:${delay + j * 40}ms">${n}</span>`).join('')}</div>
    </div>`;
  });

  html += '</div>';
  document.getElementById('resultado').innerHTML = html;
}

emparejar();