// contacts.js — Computed et méthodes pour l'annuaire

import { normSearch } from './utils.js?v=33';

// Collateur français créé UNE SEULE FOIS et réutilisé par tous les tris.
// localeCompare() reconstruit les règles de collation à chaque comparaison :
// sur 2 000 structures (~22 000 comparaisons par tri), le coût est loin d'être
// négligeable. Options identiques à celles utilisées auparavant, donc tri
// rigoureusement inchangé.
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

// Nom de famille d'un contact, pour le tri.
// Les fiches anciennes n'ont parfois qu'un champ « name » non découpé : on
// retient alors le dernier mot, qui est le nom de famille dans la quasi-
// totalité des cas (« de la Fontaine » reste mal classé, c'est assumé).
function contactLastName(c) {
    if (c.lastName) return c.lastName.trim();
    const parts = (c.name || '').trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
}

// Tri « Nom » des contacts : nom de famille, puis prénom à égalité.
// Le champ affiché (name) commence par le PRÉNOM : trier dessus revenait à
// classer l'annuaire par prénom, alors que le sélecteur annonce « Nom ».
function compareContactByName(a, b, dir = 1) {
    const la = contactLastName(a);
    const lb = contactLastName(b);
    if (!la && !lb) return 0;
    if (!la) return 1;    // sans nom exploitable → fin de liste, quel que soit le sens
    if (!lb) return -1;
    const r = collator.compare(la, lb);
    if (r !== 0) return dir * r;
    return dir * collator.compare((a.firstName || '').trim(), (b.firstName || '').trim());
}

// Comparaison réutilisable : valeurs vides toujours rejetées en fin de liste.
function compareField(a, b, field, dir = 1) {
    const va = (a[field] || '').trim();
    const vb = (b[field] || '').trim();
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return dir * collator.compare(va, vb);
}

export const contactsComputed = {
    // Liste alphabétique de TOUTES les structures, sans les filtres de l'onglet
    // Structures. Destinée aux menus déroulants : un filtre posé ailleurs ne
    // doit jamais masquer une structure dans une liste de sélection.
    sortedStructures() {
        return (this.db.structures || []).slice()
            .sort((a, b) => compareField(a, b, 'name'));
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
        return [...seen.values()].sort((a, b) => collator.compare(a, b));
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
        return [...seen.values()].sort((a, b) => collator.compare(a, b));
    },

    // Contacts affichables de la fiche structure ouverte : masque les contacts
    // privés appartenant à quelqu'un d'autre. Sans cela, la fiche laissait voir
    // les contacts privés de tous les collaborateurs.
    visibleCrmContacts() {
        const list = (this.currentCrmStruct && this.currentCrmStruct.contacts) || [];
        return list.filter(c => !(c.isPrivate && c.owner && c.owner !== this.currentUser));
    },

    filteredStructures() {
        // Valeur différée (200 ms) : évite de refiltrer et retrier toute la base
        // à chaque frappe. Le champ de saisie, lui, reste instantané.
        const s        = normSearch(this.searchStructDebounced).trim();
        const cat      = this.structFilterCat      || '';
        const genre    = this.structFilterGenre    || '';
        const reseau   = this.structFilterReseau   || '';
        const city     = normSearch(this.structFilterCity).trim();
        const status   = this.structFilterStatus   || '';
        const hasGPS   = this.structFilterGPS      || false;
        const hasContacts = this.structFilterHasContacts || false;

        const list = this.db.structures.filter(st => {
            // Recherche texte (nom, ville, email, notes) — insensible aux accents
            if (s && ![ st.name, st.city, st.email, st.notes, st.address ]
                .some(v => normSearch(v).includes(s))) return false;
            // Filtre ville
            if (city && !normSearch(st.city).includes(city)) return false;
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
        return list.sort((a, b) => compareField(a, b, field, dir));
    },

    // TOUS les contacts de l'annuaire, aplatis depuis les structures, sans aucun
    // filtre de recherche. Extrait de filteredContacts() pour deux raisons :
    //   1. la recherche globale doit voir l'annuaire entier, jamais un
    //      sous-ensemble hérité des filtres d'un onglet ;
    //   2. Vue met les computed en cache : l'aplatissement n'est plus refait à
    //      chaque appel, mais uniquement quand les structures changent.
    allContacts() {
        const all = [];
        (this.db.structures || []).forEach(s => {
            (s.contacts || []).forEach(c => {
                if (c.isPrivate && c.owner && c.owner !== this.currentUser) return;
                // Normalise le nom : priorité firstName+lastName, fallback sur name
                const displayName = (c.firstName || c.lastName)
                    ? `${c.firstName || ''} ${c.lastName || ''}`.trim()
                    : (c.name || '');
                all.push({ ...c, name: displayName, structName: s.name, structCity: s.city, structId: s.id });
            });
        });
        return all;
    },

    filteredContacts() {
        let all = this.allContacts;
        const term = normSearch(this.searchContactDebounced || this.omniSearchDebounced);
        if (term) {
            all = all.filter(c => {
                // Inclut firstName/lastName dans la recherche même si name est vide
                const searchStr = normSearch(`${c.name} ${c.firstName || ''} ${c.lastName || ''} ${c.role || ''} ${c.structName} ${c.structCity}`);
                return searchStr.includes(term);
            });
        }

        // --- Tri alphabétique (Nom, Structure ou Ville), accents-aware ---
        const field = ['structName', 'structCity'].includes(this.contactSortField)
            ? this.contactSortField : 'name';
        const dir = this.contactSortDir === 'desc' ? -1 : 1;
        // slice() : allContacts est un computed mis en cache, il ne doit jamais
        // être trié en place — sinon l'ordre fuiterait vers tous ses lecteurs.
        return all.slice().sort((a, b) => field === 'name'
            ? compareContactByName(a, b, dir)
            : compareField(a, b, field, dir));
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
