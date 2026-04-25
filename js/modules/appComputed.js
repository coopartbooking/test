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

    // ── RELANCES AUTOMATIQUES ──

    // Affaires à relancer (date de relance dépassée ou dans les 48h)
    affairesToRelance() {
        const now     = new Date();
        const in48h   = new Date(now.getTime() + 48 * 3600 * 1000);
        return (this.db.events || [])
            .filter(e => {
                if (!e.relanceDate) return false;
                if (e.stage === 'won' || e.stage === 'ann') return false;
                const d = new Date(e.relanceDate);
                return d <= in48h;
            })
            .sort((a, b) => new Date(a.relanceDate) - new Date(b.relanceDate));
    },

    // Affaires en retard de relance (date dépassée)
    affairesRelanceOverdue() {
        const now = new Date().toISOString().slice(0, 10);
        return (this.affairesToRelance || []).filter(e => e.relanceDate < now);
    },

    // ── STATISTIQUES TABLEAU DE BORD ──

    // CA et stats par projet
    statsByProject() {
        return (this.db.projects || []).map(p => {
            const events     = (this.db.events || []).filter(e => e.projectId === p.id);
            const confirmed  = events.filter(e => e.status === 'conf' || e.stage === 'won');
            const inProgress = events.filter(e => e.stage && e.stage !== 'won' && e.stage !== 'ann');
            const ca         = confirmed.reduce((s, e) => s + (Number(e.fee) || 0), 0);
            const caEstim    = inProgress.reduce((s, e) => s + (Number(e.fee) || 0), 0);
            return {
                id:          p.id,
                name:        p.name,
                color:       p.color || '#6366f1',
                confirmed:   confirmed.length,
                inProgress:  inProgress.length,
                ca,
                caEstim,
                total:       events.length,
            };
        }).sort((a, b) => b.ca - a.ca);
    },

    // CA total estimé (pipeline en cours)
    totalCAEstim() {
        return (this.db.events || [])
            .filter(e => e.stage && e.stage !== 'won' && e.stage !== 'ann')
            .reduce((s, e) => s + (Number(e.fee) || 0), 0);
    },

    // Taux de conversion par étape du pipeline
    conversionFunnel() {
        const stages = ['lead', 'contact', 'nego', 'option', 'contract', 'won'];
        const total  = (this.db.events || []).filter(e => e.stage !== 'ann').length;
        return stages.map(id => {
            const col   = (this.pipelineCols || []).find(c => c.id === id);
            const count = (this.db.events || []).filter(e => (e.stage || 'lead') === id).length;
            return {
                id,
                name:  col ? col.name : id,
                color: col ? col.dotColor : 'bg-slate-400',
                count,
                pct:   total > 0 ? Math.round(count / total * 100) : 0,
            };
        });
    },

    // Taux de conversion global lead → won
    globalConversionRate() {
        const total = (this.db.events || []).filter(e => e.stage !== 'ann').length;
        const won   = (this.db.events || []).filter(e => e.stage === 'won').length;
        return total > 0 ? Math.round(won / total * 100) : 0;
    },

    // Évolution du CA confirmé par mois (12 derniers mois)
    caByMonth() {
        const months = [];
        const now    = new Date();
        for (let i = 11; i >= 0; i--) {
            const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            const ca    = (this.db.events || [])
                .filter(e => (e.status === 'conf' || e.stage === 'won') && e.date && e.date.startsWith(key))
                .reduce((s, e) => s + (Number(e.fee) || 0), 0);
            months.push({ key, label, ca });
        }
        return months;
    },

    // Max CA mensuel (pour normaliser les barres)
    caByMonthMax() {
        return Math.max(...this.caByMonth.map(m => m.ca), 1);
    },

    // Top 5 lieux les plus sollicités
    topVenues() {
        const counts = {};
        (this.db.events || []).filter(e => e.venueName && e.stage !== 'ann').forEach(e => {
            const key = e.venueName;
            if (!counts[key]) counts[key] = { name: key, city: e.city || '', count: 0, ca: 0 };
            counts[key].count++;
            counts[key].ca += Number(e.fee) || 0;
        });
        return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
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
