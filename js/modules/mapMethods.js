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

    // --- CARTOGRAPHIE GRANDE CARTE ---
    async initMap() {
        await this.requireLeaflet();
        const mapEl = document.getElementById('map') || document.getElementById('main-map');
        if (!mapEl) return;
        if (window.myGlobalMap) { window.myGlobalMap.off(); window.myGlobalMap.remove(); }
        window.myGlobalMap = L.map(mapEl).setView([46.603354, 1.888334], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myGlobalMap);
        window.myGlobalMap.on('click', (e) => {
            this.searchCenter = e.latlng;
            this.updateMap();
        });
        this.updateMap();
    },

    updateMap() {
        if (!window.myGlobalMap) return;
        if (this.mapMarkers) this.mapMarkers.forEach(m => window.myGlobalMap.removeLayer(m));
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

        // Marqueurs sur la carte
        geoStructures.forEach(s => {
            const marker = L.marker([s.lat, s.lng]).addTo(window.myGlobalMap);
            marker.bindPopup(`<b>${s.name}</b><br>${s.city || ''}`);
            marker.on('click', () => { this.openCrmView(s); });
            this.mapMarkers.push(marker);
        });

        // Liste de contacts dans le panneau latéral
        const contactSources = this.searchCenter
            ? geoStructures
            : this.db.structures.filter(s => matchesGeoTags(s));

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
};
