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

    async exportStructurePDF(s) {
        if (!s) return;
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageW   = 210;
        const margin  = 15;
        const colW    = pageW - margin * 2;
        let   y       = margin;

        // ── Couleurs ──
        const colorPrimary  = [79, 70, 229];   // indigo
        const colorDark     = [30, 41, 59];     // slate-800
        const colorGray     = [100, 116, 139];  // slate-500
        const colorLight    = [241, 245, 249];  // slate-100

        // ── En-tête ──
        doc.setFillColor(...colorPrimary);
        doc.roundedRect(margin, y, colW, 28, 4, 4, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(s.name || 'Structure', margin + 6, y + 10);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (s.category) doc.text(s.category, margin + 6, y + 17);
        if (s.city)     doc.text(s.city, margin + 6, y + 22);
        doc.setTextColor(...colorDark);
        y += 35;

        // ── Helper : section title ──
        const sectionTitle = (title) => {
            doc.setFillColor(...colorLight);
            doc.roundedRect(margin, y, colW, 7, 2, 2, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colorPrimary);
            doc.text(title.toUpperCase(), margin + 3, y + 5);
            doc.setTextColor(...colorDark);
            y += 10;
        };

        // ── Helper : ligne infos ──
        const infoLine = (label, value) => {
            if (!value) return;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colorGray);
            doc.text(label, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorDark);
            const lines = doc.splitTextToSize(String(value), colW - 35);
            doc.text(lines, margin + 35, y);
            y += lines.length * 5 + 2;
        };

        // ── Informations générales ──
        sectionTitle('Informations');
        infoLine('Adresse',     s.address);
        infoLine('Ville',       s.city);
        infoLine('Email',       s.email);
        infoLine('Téléphone',   s.phone);
        infoLine('Site web',    s.website);
        infoLine('Capacité',    s.capacity ? s.capacity + ' pers.' : null);
        y += 3;

        // ── Tags ──
        const allTags = [
            ...(s.tags?.categories || []),
            ...(s.tags?.genres     || []),
            ...(s.tags?.reseaux    || []),
        ];
        if (allTags.length > 0) {
            sectionTitle('Tags & Réseaux');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorGray);
            doc.text(allTags.join(' • '), margin, y, { maxWidth: colW });
            y += 8;
        }

        // ── Notes ──
        if (s.notes) {
            sectionTitle('Notes');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorDark);
            const lines = doc.splitTextToSize(s.notes, colW);
            doc.text(lines, margin, y);
            y += lines.length * 5 + 5;
        }

        // ── Contacts ──
        if (s.contacts && s.contacts.length > 0) {
            sectionTitle('Contacts');
            s.contacts.forEach(c => {
                if (y > 260) { doc.addPage(); y = margin; }
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colorDark);
                doc.text(`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact', margin, y);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...colorGray);
                if (c.role)       doc.text(c.role,       margin + 60, y);
                y += 5;
                if (c.emailPro)   { doc.text(c.emailPro,   margin + 5, y); y += 4; }
                if (c.phone)      { doc.text(c.phone,       margin + 5, y); y += 4; }
                y += 3;
            });
        }

        // ── Commentaires ──
        if (s.comments && s.comments.length > 0) {
            if (y > 240) { doc.addPage(); y = margin; }
            sectionTitle('Commentaires récents');
            s.comments.slice(-5).reverse().forEach(c => {
                if (y > 270) { doc.addPage(); y = margin; }
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colorGray);
                doc.text(`${c.user || ''} — ${c.date || ''}`, margin, y);
                y += 4;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...colorDark);
                const lines = doc.splitTextToSize(c.text || '', colW);
                doc.text(lines, margin, y);
                y += lines.length * 4 + 4;
            });
        }

        // ── Pied de page ──
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(...colorGray);
            doc.text(
                `Coop'Art Booking — ${s.name} — Exporté le ${new Date().toLocaleDateString('fr-FR')} — Page ${i}/${pageCount}`,
                pageW / 2, 290, { align: 'center' }
            );
        }

        doc.save(`${(s.name || 'structure').replace(/[^a-zA-Z0-9]/g, '_')}_CRM.pdf`);

        Swal.fire({ title: 'PDF exporté ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    deleteStructure(s) {
        Swal.fire({ title: 'Supprimer ?', text: "Supprimer la structure et ses contacts ?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
            .then(r => { if (r.isConfirmed) {
                this.logActivity('Structure supprimée', s.name);
                this.db.structures = this.db.structures.filter(x => x.id !== s.id);
                this.saveDB();
            }});
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
        this.logActivity('Commentaire ajouté', this.currentCrmStruct.name);
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
