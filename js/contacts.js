// contacts.js — Computed et méthodes pour l'annuaire

export const contactsComputed = {
    // Liste alphabétique de TOUTES les structures, sans les filtres de l'onglet
    // Structures. Destinée aux menus déroulants : un filtre posé ailleurs ne
    // doit jamais masquer une structure dans une liste de sélection.
    sortedStructures() {
        return (this.db.structures || []).slice().sort((a, b) => {
            const va = (a.name || '').trim();
            const vb = (b.name || '').trim();
            if (!va && !vb) return 0;
            if (!va) return 1;
            if (!vb) return -1;
            return va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
        });
    },

    // Noms déjà utilisés dans "Suivi commercial par", pour alimenter les
    // suggestions. Les identifiants techniques (UID Firebase) sont écartés :
    // ils n'ont rien à faire dans une liste destinée à l'utilisateur.
    knownFollowers() {
        const isUid = v => /^[A-Za-z0-9]{20,}$/.test(v);
        const seen = new Map();
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                const v = (c.suiviPar || '').trim();
                if (!v || isUid(v)) return;
                const k = v.toLowerCase();
                if (!seen.has(k)) seen.set(k, v);
            });
        });
        // Complété par les collaborateurs connus (panneau admin déjà chargé)
        (this.collaboratorsList || []).forEach(col => {
            const v = (col.displayName || '').trim();
            if (!v) return;
            const k = v.toLowerCase();
            if (!seen.has(k)) seen.set(k, v);
        });
        return [...seen.values()].sort((a, b) =>
            a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }));
    },

    // Toutes les fonctions déjà saisies, pour alimenter les suggestions du champ
    // "Fonction / Rôle". Aucun stockage : la liste se construit depuis l'existant
    // et s'enrichit d'elle-même à chaque nouvelle fonction saisie.
    knownRoles() {
        const seen = new Map();   // clé normalisée -> libellé affiché
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                const r = (c.role || '').trim();
                if (!r) return;
                const k = r.toLowerCase();
                if (!seen.has(k)) seen.set(k, r);
            });
        });
        return [...seen.values()].sort((a, b) =>
            a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }));
    },

    // Contacts affichables de la fiche structure ouverte : masque les contacts
    // privés appartenant à quelqu'un d'autre. Sans cela, la fiche laissait voir
    // les contacts privés de tous les collaborateurs.
    visibleCrmContacts() {
        const list = (this.currentCrmStruct && this.currentCrmStruct.contacts) || [];
        return list.filter(c => !(c.isPrivate && c.owner && c.owner !== this.currentUser));
    },

    filteredStructures() {
        const s        = (this.searchStruct       || '').toLowerCase().trim();
        const cat      = this.structFilterCat      || '';
        const genre    = this.structFilterGenre    || '';
        const reseau   = this.structFilterReseau   || '';
        const city     = (this.structFilterCity    || '').toLowerCase().trim();
        const status   = this.structFilterStatus   || '';
        const hasGPS   = this.structFilterGPS      || false;
        const hasContacts = this.structFilterHasContacts || false;

        const list = this.db.structures.filter(st => {
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

        // --- Tri alphabétique (Nom ou Ville), accents-aware, inversable A→Z / Z→A ---
        const field = this.structSortField === 'city' ? 'city' : 'name';
        const dir   = this.structSortDir === 'desc' ? -1 : 1;
        return list.sort((a, b) => {
            const va = (a[field] || '').trim();
            const vb = (b[field] || '').trim();
            if (!va && !vb) return 0;
            if (!va) return 1;   // valeurs vides toujours en fin de liste
            if (!vb) return -1;
            return dir * va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
        });
    },

    filteredContacts() {
        let all = [];
        this.db.structures.forEach(s => {
            if (s.contacts) s.contacts.forEach(c => {
                if (c.isPrivate && c.owner && c.owner !== this.currentUser) return;
                // Normalise le nom : priorité firstName+lastName, fallback sur name
                const displayName = (c.firstName || c.lastName)
                    ? `${c.firstName || ''} ${c.lastName || ''}`.trim()
                    : (c.name || '');
                all.push({ ...c, name: displayName, structName: s.name, structCity: s.city, structId: s.id });
            });
        });
        const term = (this.searchContact || this.omniSearch || '').toLowerCase();
        if (term) {
            all = all.filter(c => {
                // Inclut firstName/lastName dans la recherche même si name est vide
                const searchStr = `${c.name} ${c.firstName || ''} ${c.lastName || ''} ${c.role || ''} ${c.structName} ${c.structCity}`.toLowerCase();
                return searchStr.includes(term);
            });
        }

        // --- Tri alphabétique (Nom, Structure ou Ville), accents-aware ---
        const field = ['structName', 'structCity'].includes(this.contactSortField)
            ? this.contactSortField : 'name';
        const dir = this.contactSortDir === 'desc' ? -1 : 1;
        return all.sort((a, b) => {
            const va = (a[field] || '').trim();
            const vb = (b[field] || '').trim();
            if (!va && !vb) return 0;
            if (!va) return 1;   // valeurs vides toujours en fin de liste
            if (!vb) return -1;
            return dir * va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
        });
    },

    validMailingContacts() {
        let all = [];
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                if (c.isPrivate && c.owner && c.owner !== this.currentUser) return;
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
        // Exclure automatiquement les contacts désinscrits
        let list = this.validMailingContacts.filter(c => !c.isUnsubscribed);

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
