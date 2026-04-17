// js/modules/projectMethods.js — Notes et actions liées aux projets/spectacles
// Section : entre // --- NOTES PROJET --- et // --- RECHERCHE VENUE ---

export const projectMethods = {

    // --- NOTES PROJET ---
    addProjectNote() {
        if (!this.projectNoteText.trim()) return;
        if (!this.editProjectData.notes) this.editProjectData.notes = [];
        this.editProjectData.notes.push({
            id:   Date.now().toString(),
            text: this.projectNoteText.trim(),
            date: this.getProTimestamp ? this.getProTimestamp() : new Date().toLocaleString('fr-FR'),
            user: this.currentUserName,
        });
        this.projectNoteText = '';
        this.saveProjectNotes();
    },

    removeProjectNote(noteId) {
        this.editProjectData.notes = (this.editProjectData.notes || []).filter(n => n.id !== noteId);
        this.saveProjectNotes();
    },

    saveProjectNotes() {
        const idx = this.db.projects.findIndex(p => p.id === this.editProjectData.id);
        if (idx > -1) {
            this.db.projects[idx].notes = this.editProjectData.notes;
            this.saveDB();
        }
    },

    openEventFromProject(p) {
        const prefilled = {
            id: '', projectId: p.id, stage: 'lead',
            venueId: '', venueName: '', city: '',
            date: '', time: '', fee: p.defaultFee || '',
            feeType: p.feeType || 'HT', contractType: 'cession',
        };
        this.showProjectModal = false;
        this.tab = 'planning';
        this.$nextTick(() => { this.openEventModal(null, prefilled); });
    },
};
