// contacts.js — Computed et méthodes pour l'annuaire

export const contactsComputed = {
    filteredStructures() {
        const s        = (this.searchStruct       || '').toLowerCase().trim();
        const cat      = this.structFilterCat      || '';
        const genre    = this.structFilterGenre    || '';
        const reseau   = this.structFilterReseau   || '';
        const city     = (this.structFilterCity    || '').toLowerCase().trim();
        const status   = this.structFilterStatus   || '';
        const hasGPS   = this.structFilterGPS      || false;
        const hasContacts = this.structFilterHasContacts || false;

        return this.db.structures.filter(st => {
            // Recherche texte (nom, ville, email, notes)
            if (s && ![ st.name, st.city, st.email, st.notes, st.address ]
                .some(v => (v || '').toLowerCase().includes(s))) return false;
            // Filtre ville
            if (city && !(st.city || '').toLowerCase().includes(city)) return false;
            // Filtre catégorie
            if (cat && !(st.tags?.categories || []).includes(cat)) return false;
            // Filtre genre
            if (genre && !(st.tags?.genres || []).includes(genre)) return false;
            // Filtre réseau
            if (reseau && !(st.tags?.reseaux || []).includes(reseau)) return false;
            // Filtre statut
            if (status === 'active'  && st.isActive === false) return false;
            if (status === 'inactive' && st.isActive !== false) return false;
            if (status === 'vip'     && !st.isVip) return false;
            // Filtre GPS
            if (hasGPS && (!st.lat || !st.lng)) return false;
            // Filtre contacts
            if (hasContacts && !(st.contacts || []).length) return false;
            return true;
        });
    },

    filteredContacts() {
        let all = [];
        this.db.structures.forEach(s => {
            if (s.contacts) s.contacts.forEach(c => {
                if (c.isPrivate && c.owner !== this.currentUser) return;
                // Normalise le nom : priorité firstName+lastName, fallback sur name
                const displayName = (c.firstName || c.lastName)
                    ? `${c.firstName || ''} ${c.lastName || ''}`.trim()
                    : (c.name || '');
                all.push({ ...c, name: displayName, structName: s.name, structCity: s.city, structId: s.id });
            });
        });
        const term = (this.searchContact || this.omniSearch || '').toLowerCase();
        if (!term) return all;
        return all.filter(c => {
            // Inclut firstName/lastName dans la recherche même si name est vide
            const searchStr = `${c.name} ${c.firstName || ''} ${c.lastName || ''} ${c.role || ''} ${c.structName} ${c.structCity}`.toLowerCase();
            return searchStr.includes(term);
        });
    },

    validMailingContacts() {
        let all = [];
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                if (c.isPrivate && c.owner !== this.currentUser) return;
                // Priorité : emailPro (CRM) > emails[0] (ancien format) > email
                const primary = c.emailPro
                    || (c.emails && c.emails.length > 0 ? c.emails[0] : '')
                    || c.email
                    || '';
                if (!primary) return;
                // Normalise le nom ici aussi
                const displayName = (c.firstName || c.lastName)
                    ? `${c.firstName || ''} ${c.lastName || ''}`.trim()
                    : (c.name || '');
                all.push({
                    ...c,
                    name:         displayName,
                    primaryEmail: primary,
                    structName:   s.name,
                    structCity:   s.city,
                    structId:     s.id,   // ← CORRIGÉ : était absent, cassait le filtre par tags
                });
            });
        });
        return all;
    },

    filteredMailingContacts() {
        let list = this.validMailingContacts;

        // Filtrage par tags
        const f = this.mailingTagFilter || {};
        const activeFilters = ['categories', 'genres', 'reseaux', 'keywords'].filter(k => f[k] && f[k].length > 0);
        if (activeFilters.length > 0) {
            list = list.filter(c => {
                const struct = this.db.structures.find(s => s.id === c.structId);
                if (!struct || !struct.tags) return false;
                return activeFilters.every(k =>
                    f[k].some(tag => (struct.tags[k] || []).includes(tag))
                );
            });
        }

        if (!this.mailingSearch) return list;
        const s = this.mailingSearch.toLowerCase();
        return list.filter(c =>
            (c.name         || '').toLowerCase().includes(s) ||
            (c.firstName    || '').toLowerCase().includes(s) ||
            (c.lastName     || '').toLowerCase().includes(s) ||
            (c.structName   || '').toLowerCase().includes(s)
        );
    },
};

export const contactsMethods = {
    // --- EXPORT ANNUAIRE EXCEL (format natif CRM) ---
    exportContactsExcel() {
        const contacts = this.filteredContacts;
        if (!contacts || contacts.length === 0) {
            return Swal.fire('Export', 'Aucun contact à exporter.', 'info');
        }
        try {
            // Regroupe par structure
            const structMap = new Map();
            contacts.forEach(c => {
                const struct = this.db.structures.find(s => s.id === c.structId) || {};
                const key = c.structId || c.structName;
                if (!structMap.has(key)) structMap.set(key, { struct, contacts: [] });
                structMap.get(key).contacts.push(c);
            });
            this._exportNativeFormat(Array.from(structMap.values()), `export_annuaire`);
        } catch (err) {
            console.error('[exportContactsExcel]', err);
            Swal.fire('Erreur', 'Impossible de générer le fichier Excel.', 'error');
        }
    },
};
