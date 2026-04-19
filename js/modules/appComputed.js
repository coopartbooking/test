// js/modules/appComputed.js — Toutes les computed properties de app.js
// Spreadées après ...contactsComputed et ...planningComputed

export const appComputed = {

    // ── Permissions par rôle ──
    // Note : isAdmin (basé sur adminEmails) prime toujours sur userRole
    canEdit() {
        return this.isAdmin || this.userRole === 'admin' || this.userRole === 'editeur';
    },
    canAdmin() {
        return this.isAdmin || this.userRole === 'admin';
    },
    canExport() {
        return true; // Lecteur, Éditeur et Admin peuvent tous exporter
    },

    // ── Tableau de bord : prochaines dates à venir ──
    dashboardNextDates() {
        const today = new Date().toISOString().slice(0, 10);
        return (this.db.events || [])
            .filter(e => e.date && e.date >= today && e.stage !== 'ann' && e.status !== 'ann')
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 5);
    },

    totalCA() {
        return this.db.events
            .filter(e => e.status === 'conf')
            .reduce((sum, e) => sum + (Number(e.fee) || 0), 0);
    },

    omniResults() {
        if (this.omniSearch.length < 2) return {};
        const s = this.omniSearch.toLowerCase();
        const res = {};
        const c = this.filteredContacts.filter(x => (x.name || '').toLowerCase().includes(s) || (x.structName && x.structName.toLowerCase().includes(s)));
        if (c.length) res['Contacts'] = c.map(x => ({ id: x.id, name: x.name || `${x.firstName||''} ${x.lastName||''}`.trim(), sub: x.structName, type: 'contact', original: x }));
        const st = this.db.structures.filter(x => x.name.toLowerCase().includes(s) || x.city.toLowerCase().includes(s));
        if (st.length) res['Lieux & Structures'] = st.map(x => ({ id: x.id, name: x.name, sub: x.city, type: 'structure', original: x }));
        const p = this.db.projects.filter(x => x.name.toLowerCase().includes(s));
        if (p.length) res['Spectacles'] = p.map(x => ({ id: x.id, name: x.name, sub: x.genre, type: 'project', original: x }));
        return res;
    },

    // ── Tags dynamiques : liste statique + tous les tags réellement en base ──
    allTagCategories() {
        const set = new Set(this.tagCategories);
        this.db.structures.forEach(s => (s.tags?.categories || []).forEach(t => set.add(t)));
        return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
    },

    allTagGenres() {
        const set = new Set(this.tagGenres);
        this.db.structures.forEach(s => (s.tags?.genres || []).forEach(t => set.add(t)));
        return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
    },

    allTagReseaux() {
        const set = new Set(this.tagReseaux);
        this.db.structures.forEach(s => (s.tags?.reseaux || []).forEach(t => set.add(t)));
        return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
    },

    allTagKeywords() {
        const set = new Set(this.tagKeywords);
        this.db.structures.forEach(s => (s.tags?.keywords || []).forEach(t => set.add(t)));
        return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
    },

    hasActiveGeoTagFilters() {
        return Object.values(this.geoTagFilter || {}).some(arr => arr && arr.length > 0);
    },

    exportMappingFilteredContacts() {
        let list = [...(this.exportMapping.contacts || [])];
        const f = this.exportMapping;
        if (f.source === 'contacts') {
            if (f.filterStatus === 'active')  list = list.filter(c => c.isActive !== false);
            if (f.filterStatus === 'vip')     list = list.filter(c => c.isVip);
            if (f.filterStatus === 'public')  list = list.filter(c => !c.isPrivate);
            if (f.filterStatus === 'private') list = list.filter(c => c.isPrivate);
            if (f.filterStruct) list = list.filter(c => c.structId === f.filterStruct);
            if (f.filterCat || f.filterGenre) {
                list = list.filter(c => {
                    const s = this.db.structures.find(x => x.id === c.structId);
                    if (!s) return false;
                    if (f.filterCat   && !(s.tags?.categories||[]).includes(f.filterCat))   return false;
                    if (f.filterGenre && !(s.tags?.genres||[]).includes(f.filterGenre)) return false;
                    return true;
                });
            }
        }
        return list;
    },

    exportMappingPreview() {
        return this.exportMappingFilteredContacts.slice(0, 3).map(c => this.buildExportRow(c));
    },

    // ── Projet : affaires liées ──
    getProjectEvents() {
        return (projectId) => this.db.events.filter(e => e.projectId === projectId);
    },

    // ── Projet : structures liées (via affaires) ──
    getProjectStructures() {
        return (projectId) => {
            const events = this.db.events.filter(e => e.projectId === projectId && e.venueId);
            const ids = [...new Set(events.map(e => e.venueId))];
            return ids.map(id => this.db.structures.find(s => s.id === id)).filter(Boolean);
        };
    },

    // ── Projet : contacts liés (via structures liées) ──
    getProjectContacts() {
        return (projectId) => {
            const structs = this.getProjectStructures(projectId);
            const contacts = [];
            structs.forEach(s => {
                (s.contacts || []).forEach(c => {
                    contacts.push({ ...c, structName: s.name, structCity: s.city, structId: s.id });
                });
            });
            return contacts;
        };
    },

    // ── Projet : prochaine date à venir ──
    getProjectNextDate() {
        return (projectId) => {
            const today = new Date().toISOString().slice(0, 10);
            return this.db.events
                .filter(e => e.projectId === projectId && e.date && e.date >= today && e.stage !== 'ann')
                .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
        };
    },

    // ── Recherche venue dans modal affaire ──
    venueContacts() {
        if (!this.editEventData.venueId) return [];
        const s = this.db.structures.find(x => x.id === this.editEventData.venueId);
        return s ? (s.contacts || []) : [];
    },

    venueRegions() {
        const regions = new Set();
        this.db.structures.forEach(s => { if (s.region) regions.add(s.region); });
        return [...regions].sort();
    },

    venueBrowserResults() {
        let list = this.db.structures;
        if (this.venueBrowserRegion) {
            list = list.filter(s => (s.region || '') === this.venueBrowserRegion);
        }
        if (this.venueBrowserCat) {
            list = list.filter(s => (s.tags?.categories || []).includes(this.venueBrowserCat));
        }
        return list.slice(0, 50);
    },

    frenchRegions() {
        return [
            'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne',
            'Centre-Val de Loire', 'Corse', 'Grand Est', 'Guadeloupe', 'Guyane',
            'Hauts-de-France', 'Île-de-France', 'La Réunion', 'Martinique', 'Mayotte',
            'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire',
            "Provence-Alpes-Côte d'Azur",
            'Belgique', 'Suisse', 'Luxembourg', 'Canada', 'Autre',
        ];
    },

    currentSelectionObj() {
        return (this.db.selections || []).find(s => s.id === this.currentSelectionId) || null;
    },

    selectionContacts() {
        if (!this.currentSelectionObj) return [];
        const ids = this.currentSelectionObj.contactIds || [];
        return this.filteredContacts.filter(c => ids.includes(c.id));
    },

    addToSelectionFiltered() {
        if (!this.currentSelectionObj) return [];
        const existingIds = this.currentSelectionObj.contactIds || [];
        let list = this.filteredContacts.filter(c => !existingIds.includes(c.id));
        const q = (this.addToSelectionSearch || '').toLowerCase().trim();
        if (q) {
            list = list.filter(c =>
                (c.name       || '').toLowerCase().includes(q) ||
                (c.structName || '').toLowerCase().includes(q) ||
                (c.structCity || '').toLowerCase().includes(q)
            );
        }
        if (this.addToSelectionCat || this.addToSelectionGenre) {
            list = list.filter(c => {
                const s = this.db.structures.find(x => x.id === c.structId);
                if (!s) return false;
                if (this.addToSelectionCat   && !(s.tags?.categories||[]).includes(this.addToSelectionCat))   return false;
                if (this.addToSelectionGenre && !(s.tags?.genres||[]).includes(this.addToSelectionGenre)) return false;
                return true;
            });
        }
        return list;
    },

    adminStats() {
        if (!this.db || !this.db.structures) {
            return { totalContacts: 0, privateContacts: 0, structsWithGps: 0, gpsRate: 0, emailRate: 0, tagRate: 0, recentActivity: [], alerts: [] };
        }
        const allContacts     = this.db.structures.flatMap(s => s.contacts || []);
        const totalContacts   = allContacts.length;
        const privateContacts = allContacts.filter(c => c.isPrivate).length;
        const structsWithGps  = this.db.structures.filter(s => s.lat && s.lng).length;
        const structsTotal    = this.db.structures.length || 1;
        const gpsRate         = Math.round((structsWithGps / structsTotal) * 100);
        const contactsWithEmail = allContacts.filter(c => c.emailPro || c.emailPerso).length;
        const emailRate       = totalContacts > 0 ? Math.round((contactsWithEmail / totalContacts) * 100) : 0;
        const structsWithTags = this.db.structures.filter(s => {
            const t = s.tags || {};
            return (t.categories||[]).length > 0 || (t.genres||[]).length > 0 || (t.reseaux||[]).length > 0 || (t.keywords||[]).length > 0;
        }).length;
        const tagRate = Math.round((structsWithTags / structsTotal) * 100);

        // Activité récente
        const recentActivity = [];
        this.db.structures.forEach(s => {
            (s.comments || []).forEach(cm => {
                recentActivity.push({ id: 'sc_' + cm.id, type: 'comment', label: `Commentaire sur "${s.name}" : ${cm.text.substring(0,50)}${cm.text.length>50?'…':''}`, date: cm.date, user: cm.user });
            });
            (s.contacts || []).forEach(c => {
                (c.comments || []).forEach(cm => {
                    recentActivity.push({ id: 'cc_' + cm.id, type: 'contact', label: `Note sur ${c.firstName} ${c.lastName} (${s.name}) : ${cm.text.substring(0,40)}${cm.text.length>40?'…':''}`, date: cm.date, user: cm.user });
                });
            });
            if (s.createdDate) {
                recentActivity.push({ id: 'st_' + s.id, type: 'structure', label: `Structure créée : "${s.name}" — ${s.city || ''}`, date: new Date(s.createdDate).toLocaleDateString('fr-FR'), user: '' });
            }
        });
        recentActivity.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Alertes qualité
        const alerts = [];
        const noEmail = allContacts.filter(c => !c.emailPro && !c.emailPerso).length;
        if (noEmail > 0)   alerts.push({ id: 'a1', level: 'warn',  message: 'Contacts sans email',      detail: 'Ces contacts ne pourront pas recevoir de campagne mailing.',               count: noEmail });
        const noGps = this.db.structures.filter(s => !s.lat || !s.lng).length;
        if (noGps > 0)     alerts.push({ id: 'a2', level: 'warn',  message: 'Structures sans GPS',      detail: 'Non visibles sur la carte & invitations.',                                count: noGps });
        const noContact = this.db.structures.filter(s => !(s.contacts||[]).length).length;
        if (noContact > 0) alerts.push({ id: 'a3', level: 'warn',  message: 'Structures sans contact',  detail: 'Aucun interlocuteur renseigné pour ces structures.',                       count: noContact });
        const noPhone = allContacts.filter(c => !c.phoneDirect && !c.mobilePro && !c.phonePerso && !c.mobilePerso).length;
        if (noPhone > 0)   alerts.push({ id: 'a4', level: 'warn',  message: 'Contacts sans téléphone',  detail: 'Aucun numéro renseigné.',                                                 count: noPhone });
        const noCity = this.db.structures.filter(s => !s.city).length;
        if (noCity > 0)    alerts.push({ id: 'a5', level: 'error', message: 'Structures sans ville',    detail: 'La ville est indispensable pour les recherches géographiques.',            count: noCity });
        const noTags = this.db.structures.filter(s => { const t = s.tags||{}; return !(t.categories||[]).length && !(t.genres||[]).length && !(t.reseaux||[]).length && !(t.keywords||[]).length; }).length;
        if (noTags > 0)    alerts.push({ id: 'a6', level: 'warn',  message: 'Structures sans tags',     detail: 'Non filtrables dans Mailing et Carte & Invitations.',                     count: noTags });

        return { totalContacts, privateContacts, structsWithGps, gpsRate, emailRate, tagRate, recentActivity: recentActivity.slice(0, 20), alerts };
    },
};
