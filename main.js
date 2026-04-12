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
const POLL_INTERVAL = 10000;

// ── Estado ────────────────────────────────────────────────────────
let tokenClient   = null;
let accessToken   = null;
let usuarioActual = null;
let alumnos       = [];
let tamañoGrupo   = 30;
let maxVotos      = 1;   // preferencias por alumno
let modoProfesor  = false;
let pollTimer     = null;

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
        document.getElementById('maxVotosValor').textContent    = maxVotos;
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

function cambiarMaxVotos(delta) {
    maxVotos = Math.max(1, Math.min(10, maxVotos + delta));
    document.getElementById('maxVotosValor').textContent = maxVotos;
    document.getElementById('maxVotosInfo').textContent  = maxVotos;
    // Regenerar los selects del alumno con el nuevo número
    renderizarSelectsAlumno();
}

// ══════════════════════════════════════════════════════════════════
//  POLLING
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

        document.getElementById('votosNum').textContent = nVotos;
        document.getElementById('votosDe').textContent  = `/ ${nAlumnos} alumnos`;

        const pct = nAlumnos > 0 ? Math.round((nVotos / nAlumnos) * 100) : 0;
        document.getElementById('votosBarra').style.width = pct + '%';

        document.getElementById('votosLista').innerHTML = Object.entries(votos).map(([nombre, v]) => {
            const prefs = v.preferencias?.filter(Boolean) || (v.preferencia ? [v.preferencia] : []);
            const prefStr = prefs.length ? prefs.join(', ') : 'sin pref.';
            return `<span class="voto-chip">${nombre} → ${prefStr}</span>`;
        }).join('');
    } catch { /* silencioso */ }
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Config
//  Estructura:
//    __TAMAÑO__    | valor
//    __MAX_VOTOS__ | valor
//    nombre alumno | (vacío)
//    ...
//    __GRUPO_X__   | alumno1,alumno2,…
// ══════════════════════════════════════════════════════════════════
async function cargarConfigDesdeSheets() {
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetConfig}!A1:B`,
        });
        const filas = res.result.values || [];

        let nuevoTamaño    = 30;
        let nuevoMaxVotos  = 1;
        let nuevosAlumnos  = [];

        filas.forEach(fila => {
            if (!fila[0]) return;
            const clave = fila[0].trim();
            if (clave === '__TAMAÑO__')    { nuevoTamaño   = parseInt(fila[1]) || 30; }
            else if (clave === '__MAX_VOTOS__') { nuevoMaxVotos = parseInt(fila[1]) || 1; }
            else if (!clave.startsWith('__'))  { nuevosAlumnos.push(clave); }
        });

        tamañoGrupo = nuevoTamaño;
        maxVotos    = nuevoMaxVotos;
        alumnos     = nuevosAlumnos;

        document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
        document.getElementById('maxVotosInfo').textContent    = maxVotos;
        document.getElementById('tamañoValor').textContent     = tamañoGrupo;
        document.getElementById('maxVotosValor').textContent   = maxVotos;

        actualizarListaActiva();
        renderizarSelectsAlumno();

    } catch (err) {
        console.warn('Config no encontrada:', err.message);
        renderizarSelectsAlumno(); // render con defaults
    }
}

async function guardarConfigEnSheets(grupos) {
    const valores = [
        ['__TAMAÑO__',    tamañoGrupo],
        ['__MAX_VOTOS__', maxVotos],
        ...alumnos.map(n => [n]),
    ];

    if (grupos && grupos.length > 0) {
        grupos.forEach((g, i) => {
            valores.push([`__GRUPO_${i + 1}__`, g.join(',')]);
        });
    }

    const resClear = await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.spreadsheetId,
        range:         `${CONFIG.sheetConfig}!A:B`,
    });
    if (resClear.status !== 200) {
        throw new Error(`Error al limpiar Config (${resClear.status}). ¿Existe la pestaña "Config"?`);
    }

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
//  Columnas: A=email, B=nombre, C=pref1, D=pref2, …, última=timestamp
// ══════════════════════════════════════════════════════════════════
async function leerVotos() {
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A2:Z`,
        });
        const filas = res.result.values || [];
        const votos = {};
        filas.forEach(fila => {
            const email  = fila[0];
            const nombre = fila[1];
            if (!nombre) return;
            // Columnas C en adelante son preferencias, la última es timestamp
            // Detectamos timestamp por el formato ISO (contiene 'T' y 'Z')
            const resto = fila.slice(2);
            const tsIdx = resto.findLastIndex(v => v && v.includes('T') && v.includes('-'));
            const prefs = tsIdx >= 0 ? resto.slice(0, tsIdx) : resto;
            votos[nombre] = {
                email,
                preferencias: prefs.filter(Boolean),
                preferencia:  prefs[0] || null, // compatibilidad
            };
        });
        return votos;
    } catch (err) {
        if (err.status === 400 || err.status === 404) return {};
        throw new Error('Error leyendo votos: ' + (err.result?.error?.message || err.message));
    }
}

async function escribirVoto(nombre, email, preferencias) {
    // preferencias: array de strings (puede tener vacíos, los filtramos)
    const prefsLimpias = preferencias.filter(Boolean);

    // Buscar fila existente
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

    // Fila: email, nombre, pref1, pref2, …, timestamp
    const fila = [email, nombre, ...prefsLimpias, new Date().toISOString()];

    if (filaExistente) {
        // Primero limpiar la fila entera para no dejar columnas viejas
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A${filaExistente}:Z${filaExistente}`,
        });
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${CONFIG.sheetVotos}!A${filaExistente}`,
            valueInputOption: 'RAW',
            resource:         { values: [fila] },
        });
    } else {
        await asegurarCabeceraVotos();
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${CONFIG.sheetVotos}!A:A`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource:         { values: [fila] },
        });
    }
}

async function asegurarCabeceraVotos() {
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A1:B1`,
        });
        if (!res.result.values?.[0]) {
            const cabecera = ['Email', 'Nombre',
                ...Array.from({length: 10}, (_, i) => `Preferencia ${i + 1}`),
                'Timestamp'];
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId:    CONFIG.spreadsheetId,
                range:            `${CONFIG.sheetVotos}!A1`,
                valueInputOption: 'RAW',
                resource:         { values: [cabecera] },
            });
        }
    } catch { /* ignorar */ }
}

async function resetearVotos() {
    if (!confirm('¿Seguro que quieres borrar todos los votos? Esta acción no se puede deshacer.')) return;
    try {
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetVotos}!A2:Z`,
        });
        document.getElementById('seccionGrupos').style.display  = 'none';
        document.getElementById('resultadoProfesor').innerHTML  = '';
        document.getElementById('profesorStatus').style.display = 'none';
        await actualizarVotosProfesor();
        alert('✅ Votos borrados correctamente.');
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        alert('❌ Error al borrar votos: ' + msg);
    }
}

// ══════════════════════════════════════════════════════════════════
//  SELECTS DINÁMICOS (alumno)
// ══════════════════════════════════════════════════════════════════
function renderizarSelectsAlumno() {
    const contenedor = document.getElementById('selectsPreferencias');
    contenedor.innerHTML = '';

    for (let i = 0; i < maxVotos; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';

        const label = document.createElement('label');
        label.setAttribute('for', `pref_${i}`);
        label.textContent = maxVotos === 1
            ? '¿Con quién quieres ir? (opcional)'
            : `${i + 1}ª preferencia${i === 0 ? ' (principal)' : ' (opcional)'}`;

        const select = document.createElement('select');
        select.id = `pref_${i}`;
        select.innerHTML = '<option value="">-- Sin preferencia --</option>';

        alumnos.forEach(a => {
            if (a !== (usuarioActual?.nombre ?? '')) {
                const o = document.createElement('option');
                o.value = o.textContent = a;
                select.appendChild(o);
            }
        });

        // Evitar repetir la misma persona en varias preferencias
        select.addEventListener('change', () => evitarDuplicadosEnSelects());

        wrap.appendChild(label);
        wrap.appendChild(select);
        contenedor.appendChild(wrap);
    }
}

function evitarDuplicadosEnSelects() {
    const selects = Array.from(document.querySelectorAll('[id^="pref_"]'));
    const elegidos = selects.map(s => s.value).filter(Boolean);

    selects.forEach(sel => {
        const valorActual = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (opt.value && opt.value !== valorActual && elegidos.includes(opt.value)) {
                opt.disabled = true;
            } else {
                opt.disabled = false;
            }
        });
    });
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
        await guardarConfigEnSheets(null);
        actualizarListaActiva();
        renderizarSelectsAlumno();
        document.getElementById('listaPreview').style.display = 'none';
        status.className = 'upload-status success';
        status.innerHTML = `✅ Lista publicada: <strong>${alumnos.length}</strong> alumnos · Grupos de <strong>${tamañoGrupo}</strong> · <strong>${maxVotos}</strong> voto(s) por alumno.`;
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
    document.getElementById('maxVotosInfo').textContent    = maxVotos;
}

// ══════════════════════════════════════════════════════════════════
//  ALUMNO: ENVIAR PREFERENCIAS
// ══════════════════════════════════════════════════════════════════
async function enviarPreferencia() {
    if (!usuarioActual)  { alert('Inicia sesión primero.'); return; }
    if (!alumnos.length) { alert('El profesor aún no ha publicado la lista.'); return; }

    // Recoger todos los selects
    const selects     = Array.from(document.querySelectorAll('[id^="pref_"]'));
    const preferencias = selects.map(s => s.value.trim()).filter(Boolean);

    const st = document.getElementById('alumnoStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Enviando preferencias…';

    try {
        await escribirVoto(usuarioActual.nombre, usuarioActual.email, preferencias);
        st.className = 'upload-status success';
        st.innerHTML = preferencias.length
            ? `✅ Preferencias enviadas: <strong>${preferencias.join(', ')}</strong>.`
            : '✅ Enviado sin preferencia.';
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ ${msg}`;
    }
}

function resetearAlumno() {
    document.querySelectorAll('[id^="pref_"]').forEach(s => { s.value = ''; });
    evitarDuplicadosEnSelects();
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

        await guardarConfigEnSheets(grupos);

        st.className = 'upload-status success';
        st.innerHTML = `✅ ${grupos.length} grupos generados y guardados.`;

        mostrarResultadoProfesor(grupos, votos);
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ Error: ${msg}`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  ALGORITMO DE EMPAREJAMIENTO (multi-preferencia)
//
//  Paso 1: para cada alumno A, recorrer sus preferencias en orden.
//          Si B también tiene a A como alguna de sus preferencias → par mutuo.
//  Paso 2: no emparejados → pool aleatorio → completar grupos.
// ══════════════════════════════════════════════════════════════════
function calcularGrupos(listaAlumnos, votos) {
    // Construir mapa nombre → array de preferencias
    const prefs = {};
    listaAlumnos.forEach(a => {
        prefs[a] = votos[a]?.preferencias?.filter(Boolean) || [];
    });

    const asignado = new Set();
    const grupos   = [];

    // Paso 1: pares mutuos (A tiene a B en sus prefs Y B tiene a A en las suyas)
    listaAlumnos.forEach(a => {
        if (asignado.has(a)) return;
        for (const b of prefs[a]) {
            if (!b || asignado.has(b)) continue;
            if (prefs[b]?.includes(a)) {
                asignado.add(a); asignado.add(b);
                grupos.push([a, b]);
                break;
            }
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
    document.getElementById('seccionGrupos').style.display = '';
    const div      = document.getElementById('resultadoProfesor');
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
                // Mostrar 🤝 si hay mutualidad con cualquier preferencia
                const esMutuo = prefs_mutuos(n, g, votos);
                return `<span class="chip" style="animation-delay:${delay + j * 30}ms">${n}${esMutuo ? ' 🤝' : ''}</span>`;
            }).join('')}</div>
        </div>`;
    });

    html += '</div>';
    div.innerHTML = html;
}

function prefs_mutuos(nombre, grupo, votos) {
    const misPrefs = votos[nombre]?.preferencias || [];
    return misPrefs.some(p => p && grupo.includes(p) && (votos[p]?.preferencias || []).includes(nombre));
}
