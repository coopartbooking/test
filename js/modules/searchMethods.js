// js/modules/searchMethods.js — Export mapping, Actions groupées, Recherches & Sélections
// Section : entre // --- EXPORT AVEC MAPPING --- et // --- NOTES PROJET ---

export const searchMethods = {

    // --- EXPORT AVEC MAPPING ---
    openExportMapping(source) {
        const defaultCols = ['firstName','lastName','role','structName','structCity','emailPro','phoneDirect','mobilePro'];
        this.exportMapping.source        = source;
        this.exportMapping.cols          = [...defaultCols];
        this.exportMapping.format        = 'xlsx';
        this.exportMapping.filterStatus  = '';
        this.exportMapping.filterStruct  = '';
        this.exportMapping.filterCat     = '';
        this.exportMapping.filterGenre   = '';

        if (source === 'geo') {
            // Contacts de la carte (déjà enrichis avec structName, structCity etc.)
            this.exportMapping.contacts = this.selectedMailingContacts.map(c => ({
                ...c,
                structId: c.structId || '',
            }));
        } else {
            // Contacts de l'annuaire pro (enrichis avec infos structure)
            this.exportMapping.contacts = this.filteredContacts.map(c => {
                const s = this.db.structures.find(x => x.id === c.structId) || {};
                return {
                    ...c,
                    structName:    c.structName    || s.name    || '',
                    structCity:    c.structCity    || s.city    || '',
                    structZip:     c.structZip     || s.zip     || '',
                    structAddress: c.structAddress || s.address || '',
                    structPhone:   c.structPhone   || s.phone1  || '',
                };
            });
        }
        this.showExportMapping = true;
    },

    buildExportRow(c) {
        const row = {};
        this.exportMapping.cols.forEach(key => {
            if (key === 'isVip')           row[key] = c.isVip     ? 'Oui' : 'Non';
            else if (key === 'visibility') row[key] = c.isPrivate ? 'Privé' : 'Public';
            else                           row[key] = c[key] || '';
        });
        return row;
    },

    async runExportMapping() {
        await this.requireXLSX();
        const list = this.exportMappingFilteredContacts;
        if (!list.length || !this.exportMapping.cols.length) return;

        const cols    = this.exportMapping.availableCols.filter(c => this.exportMapping.cols.includes(c.key));
        const headers = cols.map(c => c.label);
        const rows    = list.map(c => cols.map(col => {
            if (col.key === 'isVip')      return c.isVip     ? 'Oui' : 'Non';
            if (col.key === 'visibility') return c.isPrivate ? 'Privé' : 'Public';
            return c[col.key] || '';
        }));

        const date   = new Date().toISOString().slice(0, 10);
        const source = this.exportMapping.source === 'geo' ? 'Carte' : 'Annuaire';

        if (this.exportMapping.format === 'csv') {
            const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = `Export_${source}_${date}.csv`; a.click();
            URL.revokeObjectURL(url);
        } else {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            ws['!cols'] = headers.map(() => ({ wch: 20 }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Export');
            this.xlsxDownload(wb, `Export_${source}_${date}.xlsx`);
        }

        this.showExportMapping = false;
        Swal.fire({ title: 'Export téléchargé ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    // --- ACTIONS GROUPÉES RECHERCHES & SÉLECTIONS ---
    openCrmFromContact(c) {
        const s = this.db.structures.find(x => x.id === c.structId);
        if (!s) return Swal.fire({ title: 'Structure introuvable', icon: 'warning', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
        this.showCrmModal = false;
        this.tab = 'structures';
        this.$nextTick(() => {
            this.openCrmView(s);
            setTimeout(() => {
                const contact = this.currentCrmStruct?.contacts?.find(x => x.id === c.id);
                if (contact) this.openCrmContact(contact);
            }, 200);
        });
    },

    openEventFromContact(c) {
        const s = this.db.structures.find(x => x.id === c.structId);
        const prefilled = {
            id:           '',
            projectId:    this.db.projects.length === 1 ? this.db.projects[0].id : '',
            stage:        'lead',
            venueId:      s ? s.id   : '',
            venueName:    s ? s.name : (c.structName || ''),
            city:         s ? s.city : (c.structCity || ''),
            date:         '',
            time:         '',
            fee:          s && this.db.projects.length === 1 ? (this.db.projects[0].defaultFee || '') : '',
            feeType:      'HT',
            contractType: 'cession',
            status:       'prospect',
            notes:        `Contact : ${c.name}${c.role ? ' (' + c.role + ')' : ''}`,
        };
        this.tab = 'planning';
        this.$nextTick(() => { this.openEventModal(null, prefilled); });
    },

    sendToMailing(contacts) {
        const enriched = contacts.map(c => {
            const s = this.db.structures.find(x => x.id === c.structId) || {};
            return {
                ...c,
                structName:    c.structName    || s.name    || '',
                structCity:    c.structCity    || s.city    || '',
                structZip:     c.structZip     || s.zip     || '',
                structAddress: c.structAddress || s.address || '',
                structPhone:   c.structPhone   || s.phone1  || '',
            };
        });
        this.selectedMailingContacts = enriched;
        this.tab = 'mailing';
        this.mailingActiveTab = 'compose';
        Swal.fire({ title: `${enriched.length} contact(s) chargé(s) ✓`, text: 'Composez votre campagne email dans l\'onglet Mailing.', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
    },

    sendToMap(contacts) {
        const enriched = contacts.map(c => {
            const s = this.db.structures.find(x => x.id === c.structId) || {};
            return {
                ...c,
                structName:    c.structName    || s.name    || '',
                structCity:    c.structCity    || s.city    || '',
                structZip:     c.structZip     || s.zip     || '',
                structAddress: c.structAddress || s.address || '',
                structPhone:   c.structPhone   || s.phone1  || '',
            };
        });
        this.selectedMailingContacts = enriched;
        this.tab = 'geo';
        this.$nextTick(() => { setTimeout(() => { this.initMap(); }, 300); });
        Swal.fire({ title: `${enriched.length} contact(s) chargé(s) sur la carte ✓`, icon: 'success', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
    },

    openExportFromList(contacts) {
        const enriched = contacts.map(c => {
            const s = this.db.structures.find(x => x.id === c.structId) || {};
            return {
                ...c,
                structName:    c.structName    || s.name    || '',
                structCity:    c.structCity    || s.city    || '',
                structZip:     c.structZip     || s.zip     || '',
                structAddress: c.structAddress || s.address || '',
                structPhone:   c.structPhone   || s.phone1  || '',
            };
        });
        this.exportMapping.source       = 'contacts';
        this.exportMapping.contacts     = enriched;
        this.exportMapping.cols         = ['firstName','lastName','role','structName','structCity','emailPro','phoneDirect','mobilePro'];
        this.exportMapping.format       = 'xlsx';
        this.exportMapping.filterStatus = '';
        this.exportMapping.filterStruct = '';
        this.exportMapping.filterCat    = '';
        this.exportMapping.filterGenre  = '';
        this.showExportMapping = true;
    },

    // --- RECHERCHES SAUVEGARDÉES ---
    openNewSearch() {
        this.currentSearch   = { name: '', criteria: [], filterCity: '', filterStatus: '', filterRegion: '' };
        this.currentSearchId = null;
        this.searchResults   = [];
        this.$nextTick(() => {
            const nameInput = document.querySelector('input[placeholder="Nom de la recherche..."]');
            if (nameInput) nameInput.focus();
        });
    },

    toggleSearchCriteria(family, tag) {
        const idx = this.currentSearch.criteria.findIndex(c => c.family === family && c.tag === tag);
        if (idx > -1) this.currentSearch.criteria.splice(idx, 1);
        else          this.currentSearch.criteria.push({ family, tag });
        this.runSearch();
    },

    isSearchCriteria(family, tag) {
        return this.currentSearch.criteria.some(c => c.family === family && c.tag === tag);
    },

    runSearch() {
        const criteria = this.currentSearch.criteria;
        const city     = (this.currentSearch.filterCity   || '').toLowerCase().trim();
        const status   = this.currentSearch.filterStatus  || '';
        const region   = this.currentSearch.filterRegion  || '';

        const byFamily = {};
        criteria.forEach(c => {
            if (!byFamily[c.family]) byFamily[c.family] = [];
            byFamily[c.family].push(c.tag);
        });

        this.searchResults = this.filteredContacts.filter(c => {
            const s = this.db.structures.find(x => x.id === c.structId);
            if (!s) return false;
            for (const [family, tags] of Object.entries(byFamily)) {
                const structTags = (s.tags && s.tags[family]) || [];
                if (!tags.some(t => structTags.includes(t))) return false;
            }
            if (city   && !(s.city||'').toLowerCase().includes(city) && !(s.zip||'').includes(city)) return false;
            if (region && (s.region || '') !== region) return false;
            if (status === 'active' && c.isActive === false) return false;
            if (status === 'vip'    && !c.isVip)             return false;
            if (status === 'public' && c.isPrivate)          return false;
            return true;
        });
    },

    async saveCurrentSearch() {
        if (!this.currentSearch.name.trim() || !this.currentSearch.criteria.length) return;
        this.runSearch();
        const existing = (this.db.savedSearches || []).findIndex(s => s.id === this.currentSearchId);
        const entry = {
            id:           this.currentSearchId || Date.now().toString(),
            name:         this.currentSearch.name.trim(),
            criteria:     JSON.parse(JSON.stringify(this.currentSearch.criteria)),
            filterCity:   this.currentSearch.filterCity   || '',
            filterStatus: this.currentSearch.filterStatus || '',
            filterRegion: this.currentSearch.filterRegion || '',
            resultCount:  this.searchResults.length,
            savedAt:      new Date().toISOString(),
        };
        if (!this.db.savedSearches) this.db.savedSearches = [];
        if (existing > -1) this.db.savedSearches[existing] = entry;
        else               this.db.savedSearches.push(entry);
        this.currentSearchId = entry.id;
        await this.saveDB();
        Swal.fire({ title: 'Recherche enregistrée ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    loadSearch(s) {
        this.currentSearchId = s.id;
        this.currentSearch   = {
            name:         s.name,
            criteria:     JSON.parse(JSON.stringify(s.criteria)),
            filterCity:   s.filterCity   || '',
            filterStatus: s.filterStatus || '',
            filterRegion: s.filterRegion || '',
        };
        this.runSearch();
    },

    async deleteSearch(id) {
        const r = await Swal.fire({ title: 'Supprimer cette recherche ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Supprimer' });
        if (!r.isConfirmed) return;
        this.db.savedSearches = (this.db.savedSearches || []).filter(s => s.id !== id);
        if (this.currentSearchId === id) { this.currentSearchId = null; this.searchResults = []; }
        await this.saveDB();
    },

    // --- SÉLECTIONS MANUELLES ---
    async createSelection() {
        const r = await Swal.fire({ title: 'Nouvelle sélection', input: 'text', inputPlaceholder: 'Nom de la sélection...', showCancelButton: true, confirmButtonText: 'Créer', cancelButtonText: 'Annuler' });
        if (!r.isConfirmed || !r.value.trim()) return;
        if (!this.db.selections) this.db.selections = [];
        const sel = { id: Date.now().toString(), name: r.value.trim(), contactIds: [], createdAt: new Date().toISOString() };
        this.db.selections.push(sel);
        this.currentSelectionId = sel.id;
        await this.saveDB();
    },

    async deleteSelection(id) {
        const r = await Swal.fire({ title: 'Supprimer cette sélection ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Supprimer' });
        if (!r.isConfirmed) return;
        this.db.selections = (this.db.selections || []).filter(s => s.id !== id);
        if (this.currentSelectionId === id) this.currentSelectionId = null;
        await this.saveDB();
    },

    openAddToSelection() {
        if (!this.currentSelectionId) return;
        this.addToSelectionSearch = '';
        this.addToSelectionCat    = '';
        this.addToSelectionGenre  = '';
        this.addToSelectionPicked = [];
        this.showAddToSelection   = true;
    },

    toggleAddToSelectionPick(contactId) {
        const idx = this.addToSelectionPicked.indexOf(contactId);
        if (idx > -1) this.addToSelectionPicked.splice(idx, 1);
        else          this.addToSelectionPicked.push(contactId);
    },

    async confirmAddToSelection() {
        const sel = this.currentSelectionObj;
        if (!sel || !this.addToSelectionPicked.length) return;
        let added = 0;
        this.addToSelectionPicked.forEach(id => {
            if (!sel.contactIds.includes(id)) { sel.contactIds.push(id); added++; }
        });
        await this.saveDB();
        this.showAddToSelection = false;
        Swal.fire({ title: `${added} contact(s) ajouté(s) ✓`, icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    async removeFromSelection(selId, contactId) {
        const sel = (this.db.selections || []).find(s => s.id === selId);
        if (!sel) return;
        sel.contactIds = (sel.contactIds || []).filter(id => id !== contactId);
        await this.saveDB();
    },

    async saveSelections() {
        await this.saveDB();
    },

    getContactSelections(c) {
        return (this.db.selections || []).filter(s => (s.contactIds || []).includes(c.id));
    },

    async addSearchToSelection(s) {
        if (!(this.db.selections || []).length) {
            return Swal.fire('Info', "Créez d'abord une sélection dans l'onglet Mes Sélections.", 'info');
        }
        const opts = {};
        this.db.selections.forEach(sel => { opts[sel.id] = sel.name; });
        const r = await Swal.fire({
            title: 'Ajouter à une sélection',
            input: 'select',
            inputOptions: opts,
            inputPlaceholder: 'Choisir une sélection...',
            showCancelButton: true,
            confirmButtonText: 'Ajouter',
        });
        if (!r.isConfirmed) return;
        this.loadSearch(s);
        await this.$nextTick();
        const sel = this.db.selections.find(x => x.id === r.value);
        if (!sel) return;
        let added = 0;
        this.searchResults.forEach(c => {
            if (!sel.contactIds.includes(c.id)) { sel.contactIds.push(c.id); added++; }
        });
        await this.saveDB();
        Swal.fire({ title: `${added} contact(s) ajouté(s) ✓`, icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    exportSelection(sel) {
        const contacts = this.filteredContacts.filter(c => (sel.contactIds || []).includes(c.id));
        if (!contacts.length) return Swal.fire('Info', 'Sélection vide.', 'info');
        this.exportMapping.source   = 'contacts';
        this.exportMapping.contacts = contacts.map(c => {
            const s = this.db.structures.find(x => x.id === c.structId) || {};
            return { ...c, structName: c.structName || s.name || '', structCity: c.structCity || s.city || '', structZip: s.zip || '', structAddress: s.address || '', structPhone: s.phone1 || '' };
        });
        this.exportMapping.cols         = ['firstName','lastName','role','structName','structCity','emailPro','phoneDirect','mobilePro'];
        this.exportMapping.format       = 'xlsx';
        this.exportMapping.filterStatus = '';
        this.exportMapping.filterStruct = '';
        this.exportMapping.filterCat    = '';
        this.exportMapping.filterGenre  = '';
        this.showExportMapping = true;
    },
};
