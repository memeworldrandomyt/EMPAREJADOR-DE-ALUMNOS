// ══════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
    clientId:      '490204576711-mjpqqt3pjsh5nf9udo4272719eedhjvb.apps.googleusercontent.com',
    apiKey:        'AIzaSyDDg3DGAtuEqaDusmJxlmjmLfy40og0ccQ',
    spreadsheetId: '1JAFWVUenNEDssEPo9mb4Ni4YzKcZlAAf4dxEDDNSnA8',
    sheetVotos:    'Votos',
    sheetConfig:   'Config',   // hoja para guardar lista y tamaño de grupo
};

const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets.currentonly https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const CODIGO_PROF   = 'PR0F3SOR';

// ── Estado ────────────────────────────────────────────────────────
let tokenClient   = null;
let accessToken   = null;
let usuarioActual = null;
let alumnos       = [];
let tamañoGrupo   = 30;
let modoProfesor  = false;

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
        usuarioActual = { nombre: perfil.name || perfil.email, email: perfil.email, foto: perfil.picture || '' };

        document.getElementById('userName').textContent  = usuarioActual.nombre;
        document.getElementById('userEmail').textContent = usuarioActual.email;

        const avatarImg      = document.getElementById('userAvatar');
        const avatarFallback = document.getElementById('userAvatarFallback');
        if (usuarioActual.foto) {
            avatarImg.src = usuarioActual.foto; avatarImg.style.display = ''; avatarFallback.style.display = 'none';
        } else {
            avatarImg.style.display = 'none'; avatarFallback.style.display = '';
            avatarFallback.textContent = usuarioActual.nombre[0].toUpperCase();
        }

        document.getElementById('pantallaLogin').style.display = 'none';
        document.getElementById('pantallaApp').style.display   = '';

        // Cargar configuración guardada (lista + tamaño) desde Sheets
        await cargarConfigDesdeSheets();

    } catch (err) { mostrarLoginError('No se pudo obtener el perfil: ' + err.message); }
}

function mostrarLoginError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg; el.style.display = msg ? 'block' : 'none';
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
        document.getElementById('panelProfesor').style.display = '';
        document.getElementById('accesoProfesor').style.display = 'none';
        // Actualizar el control de tamaño con el valor actual
        document.getElementById('tamañoValor').textContent = tamañoGrupo;
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
        setTimeout(() => { error.style.display = 'none'; }, 2000);
    }
}

function cerrarModoProfesor() {
    modoProfesor = false;
    document.getElementById('panelProfesor').style.display   = 'none';
    document.getElementById('accesoProfesor').style.display  = '';
    document.getElementById('codigoProfesor').value          = '';
}

function cambiarTamaño(delta) {
    tamañoGrupo = Math.max(2, Math.min(100, tamañoGrupo + delta));
    document.getElementById('tamañoValor').textContent    = tamañoGrupo;
    document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Config (lista + tamaño de grupo)
// ══════════════════════════════════════════════════════════════════

async function cargarConfigDesdeSheets() {
    try {
        const res  = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${CONFIG.sheetConfig}!A1:B`,
        });
        const filas = res.result.values || [];

        let nuevoTamaño  = 30;
        let nuevosAlumnos = [];

        filas.forEach(fila => {
            if (!fila[0]) return;
            if (fila[0] === '__TAMAÑO__' && fila[1]) {
                nuevoTamaño = parseInt(fila[1]) || 30;
            } else if (fila[0] !== '__TAMAÑO__' && fila[0].trim()) {
                nuevosAlumnos.push(fila[0].trim());
            }
        });

        tamañoGrupo = nuevoTamaño;
        alumnos     = nuevosAlumnos;

        document.getElementById('tamañoGrupoInfo').textContent = tamañoGrupo;
        document.getElementById('tamañoValor').textContent     = tamañoGrupo;
        actualizarListaActiva();
        inicializarSelect();

    } catch (err) {
        // La hoja Config aún no existe → valores por defecto
        console.log('Config no encontrada, usando valores por defecto:', err.message);
    }
}

async function guardarConfigEnSheets() {
    // Fila 1: __TAMAÑO__ | valor
    // Filas 2+: nombre alumno
    const valores = [
        ['__TAMAÑO__', tamañoGrupo],
        ...alumnos.map(n => [n])
    ];

    // Limpiar hoja y reescribir
    await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.spreadsheetId,
        range:         `${CONFIG.sheetConfig}!A:B`,
    });

    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId:    CONFIG.spreadsheetId,
        range:            `${CONFIG.sheetConfig}!A1`,
        valueInputOption: 'RAW',
        resource:         { values: valores },
    });
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
        document.getElementById('resultado').innerHTML         = '';
        document.getElementById('sheetsStatus').style.display = 'none';
        alert('✅ Votos borrados correctamente.');
    } catch (err) {
        alert('❌ Error al borrar votos: ' + err.message);
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
    status.innerHTML      = '⏳ Analizando documento con IA…';

    try {
        const ext    = file.name.split('.').pop().toLowerCase();
        let nombres  = [];
        if (ext === 'txt') {
            nombres = await extraerDesdeTxt(file);
        } else if (['pdf','docx','jpg','jpeg','png','webp'].includes(ext)) {
            nombres = await extraerConClaude(file, ext);
        } else {
            throw new Error('Formato no soportado. Usa PDF, TXT, DOCX o imagen.');
        }
        if (!nombres.length) throw new Error('No se encontraron nombres en el documento.');
        nombres.sort((a, b) => a.localeCompare(b, 'es'));
        mostrarPreview(nombres);
        status.className = 'upload-status success';
        status.innerHTML = `✅ ${nombres.length} alumnos encontrados en "${file.name}"`;
    } catch (err) {
        status.className = 'upload-status error';
        status.innerHTML = `❌ ${err.message}`;
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

async function extraerConClaude(file, ext) {
    const base64 = await fileToBase64(file);
    const isImg  = ['jpg','jpeg','png','webp'].includes(ext);
    const mime   = isImg
        ? (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)
        : (ext === 'pdf' ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const contentBlock = isImg
        ? { type: 'image',    source: { type: 'base64', media_type: mime, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: mime, data: base64 } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 1000,
            system: `Eres un extractor de nombres de personas.
Devuelve ÚNICAMENTE un array JSON de nombres completos, sin texto adicional ni backticks.
Ejemplo: ["Ana García","Pedro López"]
Si no hay nombres: []`,
            messages: [{ role: 'user', content: [
                contentBlock,
                { type: 'text', text: 'Extrae todos los nombres de personas de este documento.' }
            ]}],
        })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Error con la IA.'); }
    const data  = await res.json();
    const texto = data.content.map(b => b.text || '').join('').trim();
    try {
        const parsed = JSON.parse(texto);
        if (!Array.isArray(parsed)) throw 0;
        return parsed.filter(n => typeof n === 'string' && n.trim());
    } catch { throw new Error('La IA no devolvió una lista válida.'); }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result.split(',')[1]);
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsDataURL(file);
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
    status.className = 'upload-status loading';
    status.innerHTML = '⏳ Guardando lista y configuración en Google Sheets…';

    try {
        await guardarConfigEnSheets();
        actualizarListaActiva();
        inicializarSelect();
        document.getElementById('listaPreview').style.display = 'none';
        status.className = 'upload-status success';
        status.innerHTML = `✅ Lista publicada con <strong>${alumnos.length}</strong> alumnos. Tamaño de grupo: <strong>${tamañoGrupo}</strong>.`;
    } catch (err) {
        status.className = 'upload-status error';
        status.innerHTML = `❌ Error guardando: ${err.message}`;
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
//  GUARDAR VOTO + EMPAREJAR
// ══════════════════════════════════════════════════════════════════
async function guardarYEmparejar() {
    if (!usuarioActual)  { alert('Inicia sesión primero.'); return; }
    if (!alumnos.length) { alert('El profesor aún no ha publicado la lista de alumnos.'); return; }

    const preferencia = document.getElementById('companero').value.trim();
    const st          = document.getElementById('sheetsStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Guardando preferencia en Google Sheets…';

    try {
        await escribirVoto(usuarioActual.nombre, usuarioActual.email, preferencia);
        st.className = 'upload-status success';
        st.innerHTML = '✅ Preferencia guardada. Calculando grupos…';

        const votos  = await leerVotos();
        const grupos = calcularGrupos(alumnos, votos);
        mostrarResultado(grupos, votos);
    } catch (err) {
        st.className = 'upload-status error';
        st.innerHTML = `❌ ${err.message}`;
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

    // Paso 2: resto en pool aleatorio
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
//  MOSTRAR RESULTADO
// ══════════════════════════════════════════════════════════════════
function mostrarResultado(grupos, votos) {
    const miNombre = usuarioActual?.nombre ?? '';
    const nVotaron = Object.keys(votos).length;

    let html = `<div class="resultado-titulo">✓ Grupos calculados</div>
    <div class="stats">
        <div class="stat"><div class="stat-label">Grupos</div><div class="stat-value">${grupos.length}</div></div>
        <div class="stat"><div class="stat-label">Máx/grupo</div><div class="stat-value">${tamañoGrupo}</div></div>
        <div class="stat"><div class="stat-label">Han votado</div><div class="stat-value">${nVotaron}</div></div>
    </div><div id="grupos">`;

    grupos.forEach((g, i) => {
        const esMiGrupo = g.includes(miNombre);
        const delay     = i * 60;
        html += `<div class="grupo-card${esMiGrupo ? ' mi-grupo' : ''}" style="animation-delay:${delay}ms">
            <div class="grupo-titulo">Grupo ${i + 1}${esMiGrupo ? ' ⭐' : ''}</div>
            <div class="chips">${g.map((n, j) => {
                const esMutuo = votos[n]?.preferencia && votos[votos[n].preferencia]?.preferencia === n;
                return `<span class="chip${n === miNombre ? ' chip-yo' : ''}" style="animation-delay:${delay + j * 40}ms">
                    ${n}${esMutuo ? ' 🤝' : ''}
                </span>`;
            }).join('')}</div>
        </div>`;
    });

    html += '</div>';
    document.getElementById('resultado').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════
//  RESETEAR (alumno)
// ══════════════════════════════════════════════════════════════════
function resetear() {
    document.getElementById('companero').value             = '';
    document.getElementById('resultado').innerHTML         = '';
    document.getElementById('sheetsStatus').style.display = 'none';
}
