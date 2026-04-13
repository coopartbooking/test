// contacts.js — Computed et méthodes pour l'annuaire

export const contactsComputed = {
    filteredStructures() {
        if (!this.searchStruct) return this.db.structures;
        const s = this.searchStruct.toLowerCase();
        return this.db.structures.filter(st =>
            st.name.toLowerCase().includes(s) || st.city.toLowerCase().includes(s)
        );
    },

    filteredContacts() {
        let all = [];
        this.db.structures.forEach(s => {
            if (s.contacts) s.contacts.forEach(c => {
                if (c.isPrivate && c.owner !== this.currentUser) return;
                all.push({ ...c, structName: s.name, structCity: s.city, structId: s.id });
            });
        });
        const term = (this.searchContact || this.omniSearch || '').toLowerCase();
        if (!term) return all;
        return all.filter(c => {
            const searchStr = `${c.name} ${c.role || ''} ${c.structName} ${c.structCity}`.toLowerCase();
            return searchStr.includes(term);
        });
    },

    validMailingContacts() {
        let all = [];
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                if (c.isPrivate && c.owner !== this.currentUser) return;
                const primary = (c.emails && c.emails.length > 0 && c.emails[0])
                    ? c.emails[0]
                    : (c.emailPro || c.email);
                if (primary) all.push({ ...c, primaryEmail: primary, structName: s.name });
            });
        });
        return all;
    },

    filteredMailingContacts() {
        let list = this.validMailingContacts;

        // Filtrage par tags si des filtres sont actifs
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
            (c.name || '').toLowerCase().includes(s) ||
            (c.structName || '').toLowerCase().includes(s)
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
