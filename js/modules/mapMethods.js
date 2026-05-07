// js/modules/mapMethods.js — Carte géographique, mini-carte CRM, filtres tags geo
// Section : entre // --- FILTRES TAGS CARTE GEO --- et // --- ANNUAIRE PRO ---

export const mapMethods = {

    // --- FILTRES TAGS CARTE GEO ---
    toggleGeoTagFilter(family, tag) {
        if (!this.geoTagFilter[family]) this.geoTagFilter[family] = [];
        const idx = this.geoTagFilter[family].indexOf(tag);
        if (idx > -1) this.geoTagFilter[family].splice(idx, 1);
        else this.geoTagFilter[family].push(tag);
        this.updateMap();
    },

    isGeoTagActive(family, tag) {
        return (this.geoTagFilter[family] || []).includes(tag);
    },

    clearGeoTagFilters() {
        this.geoTagFilter = {};
        this.updateMap();
    },

    openCrmContact(c = null) {
        if (!c) c = {
            id: Date.now().toString(), firstName: '', lastName: '', role: '',
            isVip: false, isActive: true, suiviPar: this.currentUser, isPrivate: false,
            emailPro: '', emailPerso: '', phoneDirect: '', phonePerso: '',
            mobilePro: '', mobilePerso: '', mobile2: '', tchat: '', tchatCode: '',
            website: '', address: '', suiteAddress: '', zip: '', city: '', country: '',
            createdDate: new Date().toISOString(), modifiedDate: '', notes: '', comments: []
        };
        this.currentCrmContact = JSON.parse(JSON.stringify(c));
    },

    saveCrmContact() {
        if (!this.currentCrmContact.lastName && !this.currentCrmContact.firstName)
            return Swal.fire('Erreur', 'Renseignez un nom ou prénom.', 'warning');
        // Sanitiser les champs texte libres du contact
        this.currentCrmContact.firstName  = this.sanitizeText(this.currentCrmContact.firstName, 100);
        this.currentCrmContact.lastName   = this.sanitizeText(this.currentCrmContact.lastName, 100);
        this.currentCrmContact.role       = this.sanitizeText(this.currentCrmContact.role, 150);
        this.currentCrmContact.notes      = this.sanitizeText(this.currentCrmContact.notes, 5000);
        this.currentCrmContact.emailPro   = this.sanitizeEmail(this.currentCrmContact.emailPro);
        this.currentCrmContact.emailPerso = this.sanitizeEmail(this.currentCrmContact.emailPerso);
        this.currentCrmContact.website    = this.sanitizeUrl(this.currentCrmContact.website);
        this.currentCrmContact.modifiedDate = new Date().toISOString();
        if (!this.currentCrmContact.createdDate) this.currentCrmContact.createdDate = new Date().toISOString();
        const idx = this.currentCrmStruct.contacts.findIndex(x => x.id === this.currentCrmContact.id);
        if (idx > -1) this.currentCrmStruct.contacts[idx] = this.currentCrmContact;
        else          this.currentCrmStruct.contacts.push(this.currentCrmContact);
        this.currentCrmStruct.contacts.forEach(cnt => cnt.name = `${cnt.firstName || ''} ${cnt.lastName || ''}`.trim());
        this.currentCrmContact = null;
    },

    deleteCrmContact(id) {
        this.currentCrmStruct.contacts = this.currentCrmStruct.contacts.filter(c => c.id !== id);
        this.currentCrmContact = null;
    },

    goToTasksFromCrm() {
        if (!this.currentCrmStruct.name.trim()) return Swal.fire('Attention', "Sauvegardez d'abord la structure", 'warning');
        this.saveCrmStruct(true);
        this.tab = 'tasks';
        setTimeout(() => this.openTaskModal(null, { relType: 'structure', relId: this.currentCrmStruct.id }), 300);
    },

    goToAnnuaireFromCrm() {
        this.saveCrmStruct(true);
        this.tab = 'contacts';
    },

    openRelated(t) {
        if (t.relType === 'structure') {
            const s = this.db.structures.find(x => x.id === t.relId);
            if (s) { this.tab = 'structures'; this.openCrmView(s); }
        } else if (t.relType === 'contact') {
            const s = this.db.structures.find(st => st.contacts && st.contacts.some(c => c.id === t.relId));
            if (s) { this.tab = 'structures'; this.openCrmView(s); }
        } else if (t.relType === 'event') {
            const e = this.db.events.find(x => x.id === t.relId);
            if (e) { this.tab = 'planning'; this.openEventModal(null, e); }
        } else if (t.relType === 'project') {
            const p = this.db.projects.find(x => x.id === t.relId);
            if (p) { this.tab = 'projects'; this.openProjectModal(p); }
        }
    },

    // --- CARTOGRAPHIE CRM (mini-carte) ---
    async initMiniMap() {
        await this.requireLeaflet();
        const mapEl = document.getElementById('mini-map');
        if (!mapEl) return;
        if (window.myCrmMap) { window.myCrmMap.off(); window.myCrmMap.remove(); }
        const lat  = this.currentCrmStruct.lat || 46.603354;
        const lng  = this.currentCrmStruct.lng || 1.888334;
        const zoom = this.currentCrmStruct.lat ? 14 : 5;
        window.myCrmMap = L.map('mini-map').setView([lat, lng], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myCrmMap);
        let marker = null;
        if (this.currentCrmStruct.lat) marker = L.marker([lat, lng]).addTo(window.myCrmMap);
        window.myCrmMap.on('click', e => {
            this.currentCrmStruct.lat = e.latlng.lat;
            this.currentCrmStruct.lng = e.latlng.lng;
            if (marker) window.myCrmMap.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(window.myCrmMap);
        });
        setTimeout(() => { window.myCrmMap.invalidateSize(); }, 500);
    },

    async geocodeAddress() {
        const s = this.currentCrmStruct;
        const query = `${s.address || ''} ${s.zip || ''} ${s.city || ''} ${s.country || 'France'}`.trim();
        if (query.length < 5) return Swal.fire('Erreur', 'Renseignez au moins une ville ou un code postal.', 'warning');
        try {
            Swal.fire({ title: 'Recherche satellite...', text: query, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                this.currentCrmStruct.lat = parseFloat(data[0].lat);
                this.currentCrmStruct.lng = parseFloat(data[0].lon);
                Swal.fire({ title: 'Cible verrouillée !', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                this.initMiniMap();
            } else {
                Swal.fire('Non trouvé', "Adresse introuvable. Cliquez sur la carte pour placer le point.", 'warning');
            }
        } catch (err) {
            Swal.fire('Erreur', 'Problème de connexion GPS.', 'error');
        }
    },

    // --- GEOCODAGE DE MASSE ---
    // Traite par lots avec : choix de taille, sauvegarde tous les 25, bouton stop,
    // détection rate-limit, Wake Lock, avertissement utilisateur
    async geocodeAllStructures() {
        const candidates = this.db.structures.filter(s =>
            (!s.lat || !s.lng) && (s.city || s.zip)
        );

        if (candidates.length === 0) {
            return Swal.fire({
                title: 'Rien à faire !',
                text: 'Toutes vos structures avec adresse ont déjà des coordonnées GPS.',
                icon: 'info'
            });
        }

        // ÉTAPE 1 : Choix de la taille du lot
        const totalRemaining = candidates.length;
        const sizes = [100, 250, 500].filter(v => v < totalRemaining);
        sizes.push(totalRemaining);
        const uniqueSizes = [...new Set(sizes)].sort((a, b) => a - b);

        const inputOptions = {};
        uniqueSizes.forEach(v => {
            const mins = Math.ceil(v * 1.1 / 60);
            inputOptions[v] = v === totalRemaining
                ? `Tout (${v} structures, ~${mins} min)`
                : `${v} structures (~${mins} min)`;
        });

        const choice = await Swal.fire({
            title: `${totalRemaining} structure(s) à géocoder`,
            html: `<div class="text-sm text-slate-600 mb-2">Combien voulez-vous traiter cette session ?</div>
                   <div class="text-xs text-slate-500">La progression est sauvegardée tous les 25 — vous pourrez relancer pour les autres sans rien perdre.</div>`,
            input: 'radio',
            inputOptions,
            inputValue: uniqueSizes[0],
            showCancelButton: true,
            confirmButtonText: 'Lancer',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#4f46e5'
        });
        if (!choice.isConfirmed || !choice.value) return;

        const batchSize = parseInt(choice.value);
        const toGeocode = candidates.slice(0, batchSize);
        const total = toGeocode.length;

        // ÉTAPE 2 : Wake Lock (empêche la mise en veille de l'écran)
        let wakeLock = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } catch (e) {
                console.warn('Wake Lock non disponible', e);
            }
        };
        await requestWakeLock();
        // Réacquérir le wake lock si l'onglet redevient visible (le navigateur le libère
        // automatiquement quand on change d'onglet)
        const visibilityHandler = async () => {
            if (document.visibilityState === 'visible' && !window._geoStopRequested) {
                await requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        // Reset flag d'arrêt global
        window._geoStopRequested = false;

        // État dynamique
        let success = 0, failed = 0, errors = 0, processed = 0;
        let currentDelay = 1100;       // ms — passe à 2100 si rate-limit détecté
        let rateLimitWarned = false;
        let lastSavedAt = 0;

        Swal.fire({
            title: 'Géocodage en cours...',
            html: `
                <div class="text-amber-700 text-xs mb-3 bg-amber-50 border border-amber-200 p-2 rounded text-left">
                    ⚠ <b>Gardez cet onglet visible</b> et ne mettez pas l'ordinateur en veille.
                </div>
                <div class="text-sm">Traitement <b id="geo-current">0</b> / <b>${total}</b></div>
                <div class="text-xs text-slate-500 mt-2 truncate" id="geo-name">—</div>
                <div class="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden">
                    <div id="geo-bar" class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
                <div class="text-xs mt-3 flex justify-around">
                    <span class="text-emerald-600">✓ <b id="geo-ok">0</b> trouvées</span>
                    <span class="text-amber-600">⚠ <b id="geo-ko">0</b> introuvables</span>
                    <span class="text-rose-600">✗ <b id="geo-err">0</b> erreurs</span>
                </div>
                <div id="geo-warning" class="hidden text-xs text-orange-700 mt-2 bg-orange-50 border border-orange-200 p-2 rounded">
                    ⏱ Limite OpenStreetMap atteinte — délai augmenté à 2 secondes
                </div>
                <div id="geo-saved" class="text-xs text-emerald-600 mt-2 font-medium"></div>
                <button id="geo-stop-btn" type="button"
                        onclick="window._geoStopRequested=true;this.disabled=true;this.textContent='⏸ Arrêt après la requête en cours...';this.classList.add('opacity-60','cursor-not-allowed');"
                        class="mt-4 w-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold py-2 rounded transition">
                    <i class="fas fa-stop mr-1"></i> Arrêter et sauvegarder
                </button>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false
        });

        // Helper : MAJ UI
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const updUI = () => {
            setText('geo-current', processed);
            setText('geo-ok', success);
            setText('geo-ko', failed);
            setText('geo-err', errors);
            const bar = document.getElementById('geo-bar');
            if (bar) bar.style.width = `${(processed / total * 100).toFixed(1)}%`;
        };

        for (let i = 0; i < toGeocode.length; i++) {
            // Vérification de la demande d'arrêt
            if (window._geoStopRequested) break;

            const s = toGeocode[i];
            setText('geo-name', s.name || '(sans nom)');

            const buildQuery = (full) => full
                ? `${s.address || ''} ${s.zip || ''} ${s.city || ''} ${s.country || 'France'}`.trim().replace(/\s+/g, ' ')
                : `${s.zip || ''} ${s.city || ''} ${s.country || 'France'}`.trim().replace(/\s+/g, ' ');

            try {
                let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(buildQuery(true))}`);

                // Détection rate-limit (HTTP 429)
                if (response.status === 429) {
                    if (!rateLimitWarned) {
                        rateLimitWarned = true;
                        currentDelay = 2100;
                        const w = document.getElementById('geo-warning');
                        if (w) w.classList.remove('hidden');
                    }
                    await new Promise(r => setTimeout(r, 3000));
                    response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(buildQuery(true))}`);
                }

                let data = await response.json();

                // Fallback : retenter avec ville+CP seulement
                if ((!data || data.length === 0) && s.address) {
                    await new Promise(r => setTimeout(r, currentDelay));
                    response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(buildQuery(false))}`);
                    data = await response.json();
                }

                if (data && data.length > 0) {
                    const idx = this.db.structures.findIndex(x => x.id === s.id);
                    if (idx > -1) {
                        this.db.structures[idx].lat = parseFloat(data[0].lat);
                        this.db.structures[idx].lng = parseFloat(data[0].lon);
                        success++;
                    }
                } else {
                    failed++;
                }
            } catch (err) {
                console.warn('Erreur géocodage', s.name, err);
                errors++;
            }

            processed++;
            updUI();

            // SAUVEGARDE INCRÉMENTALE tous les 25 traités
            if (processed % 25 === 0 && processed !== lastSavedAt) {
                lastSavedAt = processed;
                try {
                    this.saveDB();
                    setText('geo-saved', `💾 ${processed} sauvegardées en base — sécurisées`);
                } catch (e) {
                    console.warn('Erreur saveDB intermédiaire', e);
                }
            }

            // Délai obligatoire entre 2 requêtes (limite Nominatim)
            if (i < toGeocode.length - 1 && !window._geoStopRequested) {
                await new Promise(r => setTimeout(r, currentDelay));
            }
        }

        // Sauvegarde finale
        this.saveDB();
        this.updateMap();

        // Libération du Wake Lock + listener
        document.removeEventListener('visibilitychange', visibilityHandler);
        if (wakeLock) {
            try { await wakeLock.release(); } catch (e) { /* silencieux */ }
        }

        const wasStopped = window._geoStopRequested;
        window._geoStopRequested = false;

        // Recompte les structures encore sans GPS
        const stillRemaining = this.db.structures.filter(s =>
            (!s.lat || !s.lng) && (s.city || s.zip)
        ).length;

        Swal.fire({
            title: wasStopped ? 'Géocodage interrompu' : 'Lot terminé',
            html: `<div class="text-left space-y-1 text-sm">
                       <div class="text-emerald-600">✓ <b>${success}</b> structure(s) géocodée(s) avec succès</div>
                       <div class="text-amber-600">⚠ <b>${failed}</b> structure(s) introuvable(s)</div>
                       <div class="text-rose-600">✗ <b>${errors}</b> erreur(s) réseau</div>
                       ${stillRemaining > 0
                            ? `<div class="text-slate-700 mt-3 pt-3 border-t border-slate-200">📍 Il reste <b>${stillRemaining}</b> structure(s) à traiter — relancez le géocodage pour continuer.</div>`
                            : '<div class="text-emerald-600 mt-3 pt-3 border-t border-slate-200 font-bold">🎉 Toutes les structures ont été traitées !</div>'}
                       ${failed > 0 ? '<div class="text-xs text-slate-500 mt-3">💡 Pour les introuvables : ouvrez la fiche, corrigez l\'adresse, puis utilisez le bouton GPS manuel.</div>' : ''}
                   </div>`,
            icon: wasStopped ? 'warning' : (success > 0 ? 'success' : 'warning')
        });
    },

    // --- CARTOGRAPHIE GRANDE CARTE ---
    // --- CHARGEMENT DU PLUGIN CLUSTERING (à la demande) ---
    async requireLeafletCluster() {
        if (window.L && window.L.markerClusterGroup) return;
        // CSS principal
        if (!document.getElementById('leaflet-cluster-css')) {
            const link1 = document.createElement('link');
            link1.id   = 'leaflet-cluster-css';
            link1.rel  = 'stylesheet';
            link1.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
            document.head.appendChild(link1);
            const link2 = document.createElement('link');
            link2.rel  = 'stylesheet';
            link2.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
            document.head.appendChild(link2);
        }
        // Script
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
            script.onload  = () => resolve();
            script.onerror = (e) => reject(e);
            document.head.appendChild(script);
        });
    },

    async initMap() {
        await this.requireLeaflet();
        await this.requireLeafletCluster();
        const mapEl = document.getElementById('map') || document.getElementById('main-map');
        if (!mapEl) return;
        if (window.myGlobalMap) { window.myGlobalMap.off(); window.myGlobalMap.remove(); }
        window.myGlobalMap = L.map(mapEl).setView([46.603354, 1.888334], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myGlobalMap);
        window.myGlobalMap.on('click', (e) => {
            this.searchCenter = e.latlng;
            this.updateMap();
        });
        // Mise à jour de la liste des contacts si filtre viewport actif
        window.myGlobalMap.on('moveend', () => {
            if (this.filterByViewport) this.updateMap();
        });
        this.updateMap();
    },

    updateMap() {
        if (!window.myGlobalMap) return;

        // Nettoyage : ancien cluster group + cercle de recherche
        if (window.myMarkerCluster) {
            window.myMarkerCluster.clearLayers();
            window.myGlobalMap.removeLayer(window.myMarkerCluster);
        }
        if (this.searchCircle) window.myGlobalMap.removeLayer(this.searchCircle);
        this.mapMarkers = [];
        this.selectedMailingContacts = [];

        if (this.searchCenter) {
            this.searchCircle = L.circle(this.searchCenter, {
                color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.15,
                radius: this.searchRadius * 1000
            }).addTo(window.myGlobalMap);
        }

        // Filtrage par tags actifs
        const activeGeoTags = this.geoTagFilter || {};
        const hasGeoTagFilter = Object.values(activeGeoTags).some(arr => arr && arr.length > 0);
        const matchesGeoTags = (s) => {
            if (!hasGeoTagFilter) return true;
            return Object.entries(activeGeoTags).every(([family, tags]) => {
                if (!tags || tags.length === 0) return true;
                const structTags = (s.tags && s.tags[family]) || [];
                return tags.some(t => structTags.includes(t));
            });
        };

        // Structures affichées sur la carte : uniquement celles avec GPS
        const geoStructures = this.db.structures.filter(s => {
            if (!s.lat || !s.lng) return false;
            if (!matchesGeoTags(s)) return false;
            if (!this.searchCenter) return true;
            return this.getDist(this.searchCenter.lat, this.searchCenter.lng, s.lat, s.lng) <= this.searchRadius;
        });
        this.geoResults = geoStructures;

        // CLUSTERING : créer un groupe et y ajouter tous les marqueurs
        if (window.L && window.L.markerClusterGroup) {
            window.myMarkerCluster = L.markerClusterGroup({
                showCoverageOnHover: false,    // pas de polygone au survol (plus propre)
                maxClusterRadius: 50,           // rayon d'agrégation en pixels
                spiderfyOnMaxZoom: true,        // étalement quand on zoome à fond
                disableClusteringAtZoom: 14     // affichage individuel à partir du zoom 14
            });
            geoStructures.forEach(s => {
                const marker = L.marker([s.lat, s.lng]);
                marker.bindPopup(`<b>${s.name}</b><br>${s.city || ''}`);
                marker.on('click', () => { this.openCrmView(s); });
                window.myMarkerCluster.addLayer(marker);
                this.mapMarkers.push(marker);
            });
            window.myGlobalMap.addLayer(window.myMarkerCluster);
        } else {
            // Fallback (cluster non chargé) : ajout individuel
            geoStructures.forEach(s => {
                const marker = L.marker([s.lat, s.lng]).addTo(window.myGlobalMap);
                marker.bindPopup(`<b>${s.name}</b><br>${s.city || ''}`);
                marker.on('click', () => { this.openCrmView(s); });
                this.mapMarkers.push(marker);
            });
        }

        // FILTRAGE VIEWPORT : si actif, restreindre la liste des contacts
        // aux structures visibles dans la zone affichée de la carte
        let contactSources;
        if (this.filterByViewport && window.myGlobalMap.getBounds) {
            const bounds = window.myGlobalMap.getBounds();
            contactSources = (this.searchCenter ? geoStructures : this.db.structures.filter(s => matchesGeoTags(s)))
                .filter(s => s.lat && s.lng && bounds.contains([s.lat, s.lng]));
        } else {
            contactSources = this.searchCenter
                ? geoStructures
                : this.db.structures.filter(s => matchesGeoTags(s));
        }

        contactSources.forEach(s => {
            const structInfo = {
                structName: s.name, structCity: s.city,
                structZip: s.zip, structAddress: s.address,
                structPhone: s.phone1 || s.phone
            };
            if (s.contacts && s.contacts.length > 0) {
                s.contacts.forEach(c => {
                    this.selectedMailingContacts.push({ ...c, ...structInfo });
                });
            } else {
                this.selectedMailingContacts.push({
                    firstName: '', lastName: 'Contact Lieu', role: '',
                    emailPro: s.email || '', ...structInfo
                });
            }
        });
    },

    // --- NETTOYAGE DES CHAMPS VIDES ---
    // Parcourt toutes les structures et leurs sous-éléments pour supprimer
    // les chaînes vides, null, undefined, tableaux/objets vides
    async cleanEmptyFields() {
        const sizeBefore = new Blob([JSON.stringify(this.db.structures)]).size;
        const sizeBeforeKB = (sizeBefore / 1024).toFixed(1);

        const confirm = await Swal.fire({
            title: 'Nettoyer la base ?',
            html: `<div class="text-sm text-left">
                       <p class="mb-2">Cette opération supprime de toutes les structures :</p>
                       <ul class="text-xs text-slate-600 list-disc pl-5 space-y-0.5">
                           <li>Les chaînes vides <code>""</code></li>
                           <li>Les valeurs <code>null</code> et <code>undefined</code></li>
                           <li>Les tableaux <code>[]</code> et objets <code>{}</code> vides</li>
                       </ul>
                       <p class="text-xs text-slate-500 mt-3">Taille actuelle : <b>${sizeBeforeKB} KB</b></p>
                       <p class="text-xs text-amber-600 mt-2">⚠ Faites un export de sauvegarde avant si vous voulez être prudent.</p>
                   </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Lancer le nettoyage',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#4f46e5'
        });
        if (!confirm.isConfirmed) return;

        // Champs à JAMAIS supprimer (structurels, requis par le code)
        const protectedFields = new Set(['id', 'name', 'tags', 'contacts', 'comments', 'venues',
            'createdDate', 'modifiedDate', 'isActive', 'isClient', 'isVip']);

        const isEmpty = (val) => {
            if (val === null || val === undefined) return true;
            if (typeof val === 'string' && val.trim() === '') return true;
            if (Array.isArray(val) && val.length === 0) return true;
            if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
            return false;
        };

        const cleanObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            Object.keys(obj).forEach(key => {
                if (protectedFields.has(key)) return; // on ne touche pas
                if (isEmpty(obj[key])) {
                    delete obj[key];
                }
            });
            return obj;
        };

        let fieldsRemoved = 0;
        const countBefore = (o) => Object.keys(o).length;

        this.db.structures.forEach(s => {
            const before = countBefore(s);
            cleanObject(s);
            fieldsRemoved += (before - Object.keys(s).length);

            // Nettoyer aussi les contacts imbriqués
            if (Array.isArray(s.contacts)) {
                s.contacts.forEach(c => {
                    const cBefore = countBefore(c);
                    cleanObject(c);
                    fieldsRemoved += (cBefore - Object.keys(c).length);
                });
            }
            // Nettoyer aussi les venues imbriqués
            if (Array.isArray(s.venues)) {
                s.venues.forEach(v => {
                    const vBefore = countBefore(v);
                    cleanObject(v);
                    fieldsRemoved += (vBefore - Object.keys(v).length);
                });
            }
        });

        const sizeAfter = new Blob([JSON.stringify(this.db.structures)]).size;
        const sizeAfterKB = (sizeAfter / 1024).toFixed(1);
        const gainKB      = ((sizeBefore - sizeAfter) / 1024).toFixed(1);
        const gainPercent = sizeBefore > 0 ? (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(1) : 0;

        this.saveDB();
        this.updateMap();

        Swal.fire({
            title: 'Nettoyage terminé',
            html: `<div class="text-left text-sm space-y-2">
                       <div><b>${fieldsRemoved}</b> champs vides supprimés</div>
                       <div class="bg-slate-50 rounded p-3 text-xs">
                           <div class="flex justify-between"><span>Avant :</span><b>${sizeBeforeKB} KB</b></div>
                           <div class="flex justify-between"><span>Après :</span><b class="text-emerald-600">${sizeAfterKB} KB</b></div>
                           <div class="flex justify-between border-t border-slate-200 pt-1 mt-1"><span>Gain :</span><b class="text-emerald-600">${gainKB} KB (${gainPercent}%)</b></div>
                       </div>
                   </div>`,
            icon: 'success'
        });
    },
};
