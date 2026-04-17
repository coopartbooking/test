// js/modules/crmMethods.js — Moteur CRM : fiches structures, contacts, commentaires, tags
// Section : entre // --- MOTEUR CRM --- et // --- ADMIN ---
// Note : nextTick() remplacé par this.$nextTick() (équivalent dans le contexte composant Vue)

export const crmMethods = {

    // --- MOTEUR CRM ---
    openCrmView(struct = null) {
        if (!struct) {
            struct = {
                id: Date.now().toString(), name: 'Nouvelle Structure', isClient: false, isActive: true,
                clientCode: '', source: '', createdDate: new Date().toISOString(),
                address: '', suite: '', zip: '', city: '', region: '', country: 'France',
                phone1: '', phone2: '', mobile: '', fax: '', email: '', website: '',
                capacity: '', season: '', hours: '', lat: null, lng: null,
                progMonthStart: '', progMonthEnd: '',
                tags: { categories: [], genres: [], reseaux: [], keywords: [] },
                contacts: [], comments: [], venues: []
            };
        } else {
            if (!struct.tags || Array.isArray(struct.tags)) struct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
            if (!struct.contacts) struct.contacts = [];
            if (!struct.comments) struct.comments = [];
            if (!struct.venues)   struct.venues   = [];
        }
        this.currentCrmStruct  = JSON.parse(JSON.stringify(struct));
        this.currentCrmContact = null;
        this.showCrmModal      = true;
        this.$nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
    },

    closeCrmContact() {
        this.currentCrmContact = null;
        this.$nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
    },

    saveCrmStruct(silent = false) {
        // Sanitiser les champs texte libres avant sauvegarde
        this.currentCrmStruct.name    = this.sanitizeText(this.currentCrmStruct.name, 200);
        this.currentCrmStruct.address = this.sanitizeText(this.currentCrmStruct.address, 300);
        this.currentCrmStruct.notes   = this.sanitizeText(this.currentCrmStruct.notes, 5000);
        this.currentCrmStruct.website = this.sanitizeUrl(this.currentCrmStruct.website);
        this.currentCrmStruct.email   = this.sanitizeEmail(this.currentCrmStruct.email);
        if (!this.currentCrmStruct.name.trim()) return Swal.fire('Erreur', 'Le nom de la structure est obligatoire.', 'error');
        const idx = this.db.structures.findIndex(s => s.id === this.currentCrmStruct.id);
        if (idx > -1) this.db.structures[idx] = this.currentCrmStruct;
        else          this.db.structures.push(this.currentCrmStruct);
        this.saveDB();
        this.showCrmModal = false;
        if (!silent) Swal.fire({ title: 'Fiche CRM Enregistrée', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    deleteStructure(s) {
        Swal.fire({ title: 'Supprimer ?', text: "Supprimer la structure et ses contacts ?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
            .then(r => { if (r.isConfirmed) { this.db.structures = this.db.structures.filter(x => x.id !== s.id); this.saveDB(); } });
    },

    addCrmVenue() {
        Swal.fire({
            title: 'Ajouter un lieu/salle',
            html: '<input id="swal-v-name" class="swal2-input" placeholder="Nom (ex: Le Club, Petite Jauge...)">' +
                  '<input id="swal-v-cap" type="number" class="swal2-input" placeholder="Jauge (ex: 300)">',
            focusConfirm: false, showCancelButton: true, confirmButtonText: 'Ajouter', cancelButtonText: 'Annuler',
            preConfirm: () => {
                const name = document.getElementById('swal-v-name').value;
                const cap  = document.getElementById('swal-v-cap').value;
                if (!name) Swal.showValidationMessage('Le nom de la salle est obligatoire');
                return { name, capacity: cap };
            }
        }).then(r => {
            if (r.isConfirmed) {
                if (!this.currentCrmStruct.venues) this.currentCrmStruct.venues = [];
                this.currentCrmStruct.venues.push({ id: Date.now(), name: r.value.name, capacity: r.value.capacity });
            }
        });
    },

    removeCrmVenue(id) {
        this.currentCrmStruct.venues = this.currentCrmStruct.venues.filter(v => v.id !== id);
    },

    toggleCrmTag(family, tag) {
        const arr = this.currentCrmStruct.tags[family];
        const idx = arr.indexOf(tag);
        if (idx > -1) arr.splice(idx, 1);
        else          arr.push(tag);
    },

    addCrmComment() {
        if (!this.newCrmComment.trim()) return;
        if (!this.currentCrmStruct.comments) this.currentCrmStruct.comments = [];
        this.currentCrmStruct.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.sanitizeText(this.newCrmComment, 1000), user: this.currentUserName });
        this.newCrmComment = '';
        this.saveDB();
    },

    addContactComment() {
        if (!this.newContactComment.trim()) return;
        if (!this.currentCrmContact.comments) this.currentCrmContact.comments = [];
        this.currentCrmContact.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.sanitizeText(this.newContactComment, 1000), user: this.currentUserName });
        this.newContactComment = '';
        this.saveDB();
    },
};
