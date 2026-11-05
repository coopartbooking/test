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

    // --- ACTIONS PLANIFIÉES DU PROJET ---
    // Une action est une tâche ordinaire (db.tasks) liée au projet par
    // relType 'project'. Elle apparaît donc aussi dans l'écran Tâches et le
    // calendrier : rien n'est stocké en double.
    getProjectActions(projectId) {
        const pid = String(projectId);
        return (this.db.tasks || [])
            .filter(t => !t.done && t.relType === 'project' && String(t.relId) === pid)
            .sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return (a.dueDate + (a.dueTime || '')).localeCompare(b.dueDate + (b.dueTime || ''));
            });
    },

    toggleProjectActionForm() {
        this.showProjectActionForm = !this.showProjectActionForm;
        if (this.showProjectActionForm) {
            this.projectActionForm = { text: '', type: 'call', dueDate: '', dueTime: '' };
        }
    },

    addProjectAction() {
        const f = this.projectActionForm;
        if (!f.text.trim()) return Swal.fire('Erreur', 'Action obligatoire.', 'warning');
        if (!f.dueDate)     return Swal.fire('Erreur', 'Date obligatoire.', 'warning');
        if (!this.db.tasks) this.db.tasks = [];
        this.db.tasks.push({
            id:      Date.now(),
            text:    f.text.trim(),
            type:    f.type || 'other',
            dueDate: f.dueDate,
            dueTime: f.dueTime || '',
            done:    false,
            relType: 'project',
            relId:   this.editProjectData.id,
        });
        this.saveDB();
        this.showProjectActionForm = false;
    },

    isActionOverdue(t) {
        if (!t.dueDate) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(t.dueDate) < today;
    },

    // --- NOTES & ACTIONS DE L'AFFAIRE ---
    // Stockées dans e.journal (et non e.notes : ce champ texte sert déjà à la
    // variable {{notes}} des contrats et à l'export admin).
    // Comme les notes de projet, elles sont enregistrées immédiatement : on écrit
    // dans db.events ET dans la copie editEventData, pour que saveEvent() ne les
    // écrase pas ensuite.
    _setEventJournal(journal) {
        const idx = this.db.events.findIndex(e => e.id === this.editEventData.id);
        if (idx === -1) return;
        this.db.events[idx].journal = journal;
        this.editEventData.journal = JSON.parse(JSON.stringify(journal));
        this.saveDB();
    },

    addEventNote() {
        const text = this.eventNoteText.trim();
        if (!text || !this.editEventData.id) return;
        const journal = (this.editEventData.journal || []).concat([{
            id:   Date.now().toString(),
            text: text,
            date: this.getProTimestamp ? this.getProTimestamp() : new Date().toLocaleString('fr-FR'),
            user: this.currentUserName,
        }]);
        this.eventNoteText = '';
        this._setEventJournal(journal);
    },

    removeEventNote(noteId) {
        this._setEventJournal((this.editEventData.journal || []).filter(n => n.id !== noteId));
    },

    getEventActions(eventId) {
        const eid = String(eventId);
        return (this.db.tasks || [])
            .filter(t => !t.done && t.relType === 'event' && String(t.relId) === eid)
            .sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return (a.dueDate + (a.dueTime || '')).localeCompare(b.dueDate + (b.dueTime || ''));
            });
    },

    toggleEventActionForm() {
        this.showEventActionForm = !this.showEventActionForm;
        if (this.showEventActionForm) {
            this.eventActionForm = { text: '', type: 'call', dueDate: '', dueTime: '' };
        }
    },

    addEventAction() {
        const f = this.eventActionForm;
        if (!f.text.trim()) return Swal.fire('Erreur', 'Action obligatoire.', 'warning');
        if (!f.dueDate)     return Swal.fire('Erreur', 'Date obligatoire.', 'warning');
        if (!this.db.tasks) this.db.tasks = [];
        this.db.tasks.push({
            id:      Date.now(),
            text:    f.text.trim(),
            type:    f.type || 'other',
            dueDate: f.dueDate,
            dueTime: f.dueTime || '',
            done:    false,
            relType: 'event',
            relId:   this.editEventData.id,
        });
        this.saveDB();
        this.showEventActionForm = false;
    },

    // Notes du projet de l'affaire, en lecture seule (les plus récentes d'abord)
    getProjectNotesFor(projectId) {
        const p = (this.db.projects || []).find(x => String(x.id) === String(projectId));
        return p && p.notes ? p.notes.slice().reverse() : [];
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
