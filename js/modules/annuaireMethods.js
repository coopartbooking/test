// js/modules/annuaireMethods.js — Méthodes Annuaire Pro
// Section : entre // --- ANNUAIRE PRO --- et // --- IMPORT EXCEL ---

export const annuaireMethods = {

    // --- ANNUAIRE PRO ---
    editContact(c) {
        const parentStruct = this.db.structures.find(s => s.id === c.structId);
        if (parentStruct) {
            this.tab = 'structures';
            this.openCrmView(parentStruct);
            setTimeout(() => {
                const contactToEdit = this.currentCrmStruct.contacts.find(x => x.id === c.id);
                if (contactToEdit) this.openCrmContact(contactToEdit);
            }, 50);
        }
    },

    goToContactStructure(c) {
        const parentStruct = this.db.structures.find(s => s.id === c.structId);
        if (parentStruct) {
            this.tab = 'structures';
            this.openCrmView(parentStruct);
        } else {
            Swal.fire({ title: 'Structure introuvable', text: 'La structure liée à ce contact est introuvable dans la base.', icon: 'warning', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
        }
    },

    deleteContact(c) {
        Swal.fire({ title: 'Supprimer ce contact ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
            .then(r => {
                if (r.isConfirmed) {
                    const ps = this.db.structures.find(s => s.id === c.structId);
                    if (ps) { ps.contacts = ps.contacts.filter(x => x.id !== c.id); this.saveDB(); }
                }
            });
    },

    addGlobalContact() {
        Swal.fire({ icon: 'info', title: 'Nouveau système CRM', text: 'Pour ajouter un contact, ouvrez la fiche CRM de la structure à laquelle il appartient !', confirmButtonColor: '#4f46e5' });
    },
};
