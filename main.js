// ══════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
    clientId:      '490204576711-mjpqqt3pjsh5nf9udo4272719eedhjvb.apps.googleusercontent.com',
    apiKey:        'AIzaSyDDg3DGAtuEqaDusmJxlmjmLfy40og0ccQ',
    spreadsheetId: '1JAFWVUenNEDssEPo9mb4Ni4YzKcZlAAf4dxEDDNSnA8',
    sheetVotos:    'Votos',
    sheetConfig:   'Config',
};

const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const CODIGO_PROF   = 'PR0F3SOR';
const POLL_INTERVAL = 10000; // 10 segundos

// ── Estado ────────────────────────────────────────────────────────
let tokenClient    = null;
let accessToken    = null;
let usuarioActual  = null;
let alumnos        = [];
let tamañoGrupo    = 30;
let modoProfesor   = false;
let pollTimer      = null;

// ══════════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
    gapi.load('client', async () => {
        await gapi.client.init({
            apiKey:        CONFIG.apiKey,
            discoveryDocs: [DISCOVERY_DOC],
        });
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope:     SCOPES,
        callback:  async (resp) => {
            if (resp.error) { mostrarLoginError('Error de autenticación: ' + resp.error); return; }
            accessToken = resp.access_token;
            gapi.client.setToken({ access_token: accessToken });
            await cargarPerfilUsuario();
        },
    });
});

// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════
function iniciarSesion() {
    mostrarLoginError('');
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function cerrarSesion() {
    detenerPoll();
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null; usuarioActual = null; modoProfesor = false;
    document.getElementById('pantallaApp').style.display   = 'none';
    document.getElementById('pantallaLogin').style.display = '';
}

async function cargarPerfilUsuario() {
    try {
        const res    = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
        });
        const perfil = await res.json();
        usuarioActual = {
            nombre: perfil.name || perfil.email,
            email:  perfil.email,
            foto:   perfil.picture || '',
        };

        document.getElementById('userName').textContent  = usuarioActual.nombre;
        document.getElementById('userEmail').textContent = usuarioActual.email;

        const avatarImg      = document.getElementById('userAvatar');
        const avatarFallback = document.getElementById('userAvatarFallback');
        if (usuarioActual.foto) {
            avatarImg.src = usuarioActual.foto;
            avatarImg.style.display      = '';
            avatarFallback.style.display = 'none';
        } else {
            avatarImg.style.display      = 'none';
            avatarFallback.style.display = '';
            avatarFallback.textContent   = usuarioActual.nombre[0].toUpperCase();
        }

        document.getElementById('pantallaLogin').style.display = 'none';
        document.getElementById('pantallaApp').style.display   = '';

        await cargarConfigDesdeSheets();

    } catch (err) {
        mostrarLoginError('No se pudo obtener el perfil: ' + err.message);
    }
}

function mostrarLoginError(msg) {
    const el = document.getElementById('loginError');
    el.textContent   = msg;
    el.style.display = msg ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════════
//  MODO PROFESOR
// ══════════════════════════════════════════════════════════════════
function validarProfesor() {
    const input = document.getElementById('codigoProfesor');
    const error = document.getElementById('errorCodigo');

    if (input.value === CODIGO_PROF) {
        modoProfesor = true;
        input.value  = '';
        error.style.display = 'none';
        document.getElementById('panelProfesor').style.display  = '';
        document.getElementById('accesoProfesor').style.display = 'none';
        document.getElementById('tamañoValor').textContent      = tamañoGrupo;
        // Cargar votos inmediatamente y arrancar el poll
        actualizarVotosProfesor();
        arrancarPoll();
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
        setTimeout(() => { error.style.display = 'none'; }, 2000);
    }
}

function cerrarModoProfesor() {
    modoProfesor = false;
    detenerPoll();
    document.getElementById('panelProfesor').style.display  = 'none';
    document.getElementById('accesoProfesor').style.display = '';
    document.getElementById('codigoProfesor').value         = '';
}

function cambiarTamaño(delta) {
    tamañoGrupo = Math.max(2, Math.min(100, tamañoGrupo + delta));
    document.getElementById('tamañoValor').textContent     = tamañoGrupo;
    document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
}

// ══════════════════════════════════════════════════════════════════
//  POLLING (contador de votos en tiempo real)
// ══════════════════════════════════════════════════════════════════
function arrancarPoll() {
    detenerPoll();
    pollTimer = setInterval(actualizarVotosProfesor, POLL_INTERVAL);
}

function detenerPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function actualizarVotosProfesor() {
    if (!modoProfesor) return;
    try {
        const votos    = await leerVotos();
        const nVotos   = Object.keys(votos).length;
        const nAlumnos = alumnos.length;

        document.getElementById('votosNum').textContent  = nVotos;
        document.getElementById('votosDe').textContent   = `/ ${nAlumnos} alumnos`;

        const pct = nAlumnos > 0 ? Math.round((nVotos / nAlumnos) * 100) : 0;
        document.getElementById('votosBarra').style.width = pct + '%';

        // Lista de quién ha votado
        const lista = document.getElementById('votosLista');
        lista.innerHTML = Object.entries(votos).map(([nombre, v]) =>
            `<span class="voto-chip">${nombre}${v.preferencia ? ` → ${v.preferencia}` : ' (sin pref.)'}</span>`
        ).join('');
    } catch { /* silencioso — el poll no debe romper la UI */ }
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Config
//  Estructura de la hoja Config:
//    Fila 1:  __TAMAÑO__ | valor
//    Filas 2…N: nombre alumno
//    Filas N+1…: __GRUPO_X__ | alumno1,alumno2,…
// ══════════════════════════════════════════════════════════════════
async function cargarConfigDesdeSheets() {
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetConfig}!A1:B`,
        });
        const filas = res.result.values || [];

        let nuevoTamaño   = 30;
        let nuevosAlumnos = [];

        filas.forEach(fila => {
            if (!fila[0]) return;
            const clave = fila[0].trim();
            if (clave === '__TAMAÑO__' && fila[1]) {
                nuevoTamaño = parseInt(fila[1]) || 30;
            } else if (!clave.startsWith('__')) {
                nuevosAlumnos.push(clave);
            }
            // Las filas __GRUPO_X__ se ignoran aquí (son solo para el profe)
        });

        tamañoGrupo = nuevoTamaño;
        alumnos     = nuevosAlumnos;

        document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
        document.getElementById('tamañoValor').textContent     = tamañoGrupo;
        actualizarListaActiva();
        inicializarSelect();

    } catch (err) {
        console.warn('Config no encontrada:', err.message);
    }
}

async function guardarConfigEnSheets(grupos) {
    // grupos es opcional — se pasa solo cuando el profe genera grupos
    const valores = [
        ['__TAMAÑO__', tamañoGrupo],
        ...alumnos.map(n => [n]),
    ];

    // Añadir grupos al final si se proporcionan
    if (grupos && grupos.length > 0) {
        grupos.forEach((g, i) => {
            valores.push([`__GRUPO_${i + 1}__`, g.join(',')]);
        });
    }

    // 1. Limpiar
    const resClear = await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.spreadsheetId,
        range:         `${CONFIG.sheetConfig}!A:B`,
    });
    if (resClear.status !== 200) {
        throw new Error(`Error al limpiar Config (${resClear.status}). ¿Existe la pestaña "Config"?`);
    }

    // 2. Escribir
    const resUpdate = await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId:    CONFIG.spreadsheetId,
        range:            `${CONFIG.sheetConfig}!A1`,
        valueInputOption: 'RAW',
        resource:         { values: valores },
    });
    if (resUpdate.status !== 200) {
        throw new Error(`Error al escribir en Config (${resUpdate.status}).`);
    }
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Votos
// ══════════════════════════════════════════════════════════════════
async function leerVotos() {
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A2:D`,
        });
        const filas = res.result.values || [];
        const votos = {};
        filas.forEach(fila => {
            const [email, nombre, preferencia] = fila;
            if (nombre) votos[nombre] = { email, preferencia: preferencia || null };
        });
        return votos;
    } catch (err) {
        if (err.status === 400 || err.status === 404) return {};
        throw new Error('Error leyendo votos: ' + (err.result?.error?.message || err.message));
    }
}

async function escribirVoto(nombre, email, preferencia) {
    let filaExistente = null;
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A2:B`,
        });
        const filas = res.result.values || [];
        filas.forEach((fila, i) => {
            if (fila[1] === nombre || fila[0] === email) filaExistente = i + 2;
        });
    } catch { /* vacía */ }

    const valores = [[email, nombre, preferencia || '', new Date().toISOString()]];

    if (filaExistente) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${CONFIG.sheetVotos}!A${filaExistente}:D${filaExistente}`,
            valueInputOption: 'RAW',
            resource:         { values: valores },
        });
    } else {
        await asegurarCabeceraVotos();
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${CONFIG.sheetVotos}!A:D`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource:         { values: valores },
        });
    }
}

async function asegurarCabeceraVotos() {
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A1:D1`,
        });
        if (!res.result.values?.[0]) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId:    CONFIG.spreadsheetId,
                range:            `${CONFIG.sheetVotos}!A1:D1`,
                valueInputOption: 'RAW',
                resource:         { values: [['Email','Nombre','Preferencia','Timestamp']] },
            });
        }
    } catch { /* ignorar */ }
}

async function resetearVotos() {
    if (!confirm('¿Seguro que quieres borrar todos los votos? Esta acción no se puede deshacer.')) return;
    try {
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A2:D`,
        });
        document.getElementById('seccionGrupos').style.display    = 'none';
        document.getElementById('resultadoProfesor').innerHTML     = '';
        document.getElementById('profesorStatus').style.display   = 'none';
        await actualizarVotosProfesor();
        alert('✅ Votos borrados correctamente.');
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        alert('❌ Error al borrar votos: ' + msg);
    }
}

// ══════════════════════════════════════════════════════════════════
//  CARGA DE DOCUMENTO (solo profesor)
// ══════════════════════════════════════════════════════════════════
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]);
});

function cargarArchivo(e) {
    if (e.target.files[0]) procesarArchivo(e.target.files[0]);
}

async function procesarArchivo(file) {
    const status  = document.getElementById('uploadStatus');
    const preview = document.getElementById('listaPreview');
    preview.style.display = 'none';
    status.style.display  = 'block';
    status.className      = 'upload-status loading';
    status.innerHTML      = '⏳ Leyendo archivo…';

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'txt') throw new Error('Solo se admiten archivos .txt — un nombre por línea.');

        const nombres = await extraerDesdeTxt(file);
        if (!nombres.length) throw new Error('No se encontraron nombres en el archivo.');
        nombres.sort((a, b) => a.localeCompare(b, 'es'));
        mostrarPreview(nombres);
        status.className = 'upload-status success';
        status.innerHTML = `✅ ${nombres.length} alumnos encontrados en "${file.name}"`;
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        status.className = 'upload-status error';
        status.innerHTML = `❌ ${msg}`;
    }
}

function extraerDesdeTxt(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 1));
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsText(file);
    });
}

function mostrarPreview(nombres) {
    document.getElementById('countAlumnos').textContent = nombres.length;
    document.getElementById('alumnosDetectados').innerHTML =
        nombres.map(n => `<span class="chip-preview">${n}</span>`).join('');
    document.getElementById('editarAlumnos').value = nombres.join('\n');
    document.getElementById('listaPreview').style.display = 'block';
}

async function usarAlumnos() {
    const nuevos = document.getElementById('editarAlumnos').value
        .split('\n').map(l => l.trim()).filter(l => l.length > 1);
    nuevos.sort((a, b) => a.localeCompare(b, 'es'));
    alumnos = nuevos;

    const status = document.getElementById('uploadStatus');
    status.style.display = 'block';
    status.className     = 'upload-status loading';
    status.innerHTML     = '⏳ Guardando en Google Sheets…';

    try {
        await guardarConfigEnSheets(null); // sin grupos todavía
        actualizarListaActiva();
        inicializarSelect();
        document.getElementById('listaPreview').style.display = 'none';
        status.className = 'upload-status success';
        status.innerHTML = `✅ Lista publicada: <strong>${alumnos.length}</strong> alumnos · Grupos de <strong>${tamañoGrupo}</strong>.`;
        // Actualizar contador de votos
        await actualizarVotosProfesor();
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        status.className = 'upload-status error';
        status.innerHTML = `❌ Error guardando: ${msg}`;
    }
}

function actualizarListaActiva() {
    const div = document.getElementById('listaActiva');
    div.innerHTML = alumnos.length
        ? alumnos.map(n => `<span class="chip-activo">${n}</span>`).join('')
        : '<span class="chip-inactive">El profesor aún no ha cargado la lista</span>';
    document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
}

function inicializarSelect() {
    const select = document.getElementById('companero');
    select.innerHTML = '<option value="">-- Sin preferencia --</option>';
    alumnos.forEach(a => {
        if (a !== (usuarioActual?.nombre ?? '')) {
            const o = document.createElement('option');
            o.value = o.textContent = a;
            select.appendChild(o);
        }
    });
}

// ══════════════════════════════════════════════════════════════════
//  ALUMNO: ENVIAR PREFERENCIA
// ══════════════════════════════════════════════════════════════════
async function enviarPreferencia() {
    if (!usuarioActual)  { alert('Inicia sesión primero.'); return; }
    if (!alumnos.length) { alert('El profesor aún no ha publicado la lista.'); return; }

    const preferencia = document.getElementById('companero').value.trim();
    const st          = document.getElementById('alumnoStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Enviando preferencia…';

    try {
        await escribirVoto(usuarioActual.nombre, usuarioActual.email, preferencia);
        st.className = 'upload-status success';
        st.innerHTML = preferencia
            ? `✅ Preferencia enviada: quieres ir con <strong>${preferencia}</strong>.`
            : '✅ Preferencia enviada: sin preferencia.';
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ ${msg}`;
    }
}

function resetearAlumno() {
    document.getElementById('companero').value             = '';
    document.getElementById('alumnoStatus').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════
//  PROFESOR: GENERAR GRUPOS
// ══════════════════════════════════════════════════════════════════
async function generarGrupos() {
    if (!alumnos.length) { alert('Primero publica la lista de alumnos.'); return; }

    const st = document.getElementById('profesorStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Leyendo votos y generando grupos…';

    try {
        const votos  = await leerVotos();
        const grupos = calcularGrupos(alumnos, votos);

        // Guardar grupos en Config
        await guardarConfigEnSheets(grupos);

        st.className = 'upload-status success';
        st.innerHTML = `✅ ${grupos.length} grupos generados y guardados en el Sheet.`;

        mostrarResultadoProfesor(grupos, votos);
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ Error: ${msg}`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  ALGORITMO DE EMPAREJAMIENTO
// ══════════════════════════════════════════════════════════════════
function calcularGrupos(listaAlumnos, votos) {
    const prefs = {};
    listaAlumnos.forEach(a => { prefs[a] = votos[a]?.preferencia ?? null; });

    const asignado = new Set();
    const grupos   = [];

    // Paso 1: pares mutuos
    listaAlumnos.forEach(a => {
        if (asignado.has(a)) return;
        const b = prefs[a];
        if (b && prefs[b] === a && !asignado.has(b)) {
            asignado.add(a); asignado.add(b);
            grupos.push([a, b]);
        }
    });

    // Paso 2: resto aleatorio
    const pool = shuffle(listaAlumnos.filter(a => !asignado.has(a)));
    let grupoAbierto = grupos.find(g => g.length < tamañoGrupo) ?? null;
    pool.forEach(a => {
        if (!grupoAbierto || grupoAbierto.length >= tamañoGrupo) {
            grupoAbierto = []; grupos.push(grupoAbierto);
        }
        grupoAbierto.push(a);
    });

    return grupos;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ══════════════════════════════════════════════════════════════════
//  MOSTRAR GRUPOS (solo profesor)
// ══════════════════════════════════════════════════════════════════
function mostrarResultadoProfesor(grupos, votos) {
    const seccion = document.getElementById('seccionGrupos');
    const div     = document.getElementById('resultadoProfesor');
    seccion.style.display = '';

    const nVotaron = Object.keys(votos).length;
    let html = `<div class="stats" style="margin-bottom:16px">
        <div class="stat"><div class="stat-label">Grupos</div><div class="stat-value">${grupos.length}</div></div>
        <div class="stat"><div class="stat-label">Máx/grupo</div><div class="stat-value">${tamañoGrupo}</div></div>
        <div class="stat"><div class="stat-label">Votaron</div><div class="stat-value">${nVotaron}</div></div>
    </div><div class="grupos-grid">`;

    grupos.forEach((g, i) => {
        const delay = i * 60;
        html += `<div class="grupo-card" style="animation-delay:${delay}ms">
            <div class="grupo-titulo">Grupo ${i + 1} <span class="grupo-count">(${g.length})</span></div>
            <div class="chips">${g.map((n, j) => {
                const esMutuo = votos[n]?.preferencia && votos[votos[n].preferencia]?.preferencia === n;
                return `<span class="chip" style="animation-delay:${delay + j * 30}ms">${n}${esMutuo ? ' 🤝' : ''}</span>`;
            }).join('')}</div>
        </div>`;
    });

    html += '</div>';
    div.innerHTML = html;
}
