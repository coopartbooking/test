// planning.js — Computed et méthodes pour le planning, les tâches et le mailing

export const planningComputed = {
    pendingTaskCount() {
        return (this.db.tasks || []).filter(t => !t.done).length;
    },

    // BUGFIX : .slice() évite de muter db.tasks directement (Array.sort() est destructif)
    tasksSorted() {
        return (this.db.tasks || []).slice().sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            // Même jour : l'heure départage (les tâches sans heure passent en premier)
            return (a.dueDate + (a.dueTime || '')).localeCompare(b.dueDate + (b.dueTime || ''));
        });
    },

    tasksOverdue() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.tasksSorted.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < today);
    },

    tasksToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.tasksSorted.filter(t => !t.done && t.dueDate === today);
    },

    tasksUpcoming() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.tasksSorted.filter(t => !t.done && (!t.dueDate || new Date(t.dueDate) > today));
    },

    tasksDone() {
        return (this.db.tasks || [])
            .filter(t => t.done)
            .sort((a, b) => new Date(b.doneDate || 0) - new Date(a.doneDate || 0));
    },

    currentMonthName() {
        return new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(this.currentDate);
    },

    currentYear() {
        return this.currentDate.getFullYear();
    },

    isAllProjectsSelected() {
        return this.db.projects.length > 0
            && this.db.projects.every(p => this.selectedProjectIds.includes(p.id));
    },

    calendarDays() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        let days = [];

        for (let i = 0; i < startDay; i++) days.push({ date: null });

        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            const dFormat = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            let dayItems = [];

            const dayEvents = (this.db.events || []).filter(e => {
                if (!e.date) return false;
                const ed = new Date(e.date);
                return ed.getDate() === i && ed.getMonth() === month && ed.getFullYear() === year
                    && this.selectedProjectIds.includes(e.projectId);
            });
            dayEvents.forEach(e => dayItems.push({ itemType: 'event', data: e }));

            if (this.showTasksInCalendar) {
                const dayTasks = (this.db.tasks || []).filter(t => !t.done && t.dueDate === dFormat);
                dayTasks.forEach(t => dayItems.push({ itemType: 'task', data: t }));
            }

            dayItems.sort((a, b) => {
                if (a.itemType === 'event' && b.itemType === 'event')
                    return (a.data.time || '23:59').localeCompare(b.data.time || '23:59');
                if (a.itemType === 'event') return -1;
                if (b.itemType === 'event') return 1;
                return 0;
            });

            days.push({
                date: d, dFormat, dayNum: i,
                isToday: new Date().toDateString() === d.toDateString(),
                items: dayItems
            });
        }
        return days;
    },

    listEvents() {
        return (this.db.events || [])
            .filter(e => e.date && this.selectedProjectIds.includes(e.projectId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    filteredListEvents() {
        let events = this.listEvents;

        // Filtre texte
        const search = (this.planningSearch || '').toLowerCase().trim();
        if (search) {
            events = events.filter(e => {
                const proj = this.db.projects.find(p => p.id === e.projectId);
                return [e.venueName || '', e.city || '', proj ? proj.name : '']
                    .join(' ').toLowerCase().includes(search);
            });
        }

        // Filtre statut
        const sf = this.planningStatusFilter || 'all';
        if (sf === 'conf')  events = events.filter(e => e.status === 'conf' || e.stage === 'won');
        else if (sf === 'opt')  events = events.filter(e => (e.status === 'opt' || e.stage === 'option' || e.stage === 'contract') && e.stage !== 'won');
        else if (sf === 'nego') events = events.filter(e => e.stage === 'nego' || e.stage === 'contacted');
        else if (sf === 'lead') events = events.filter(e => e.stage === 'lead');

        // Filtre période
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const period = this.planningPeriod || 'all';
        if (period !== 'all') {
            let from = null, to = null;
            if      (period === 'month')  { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
            else if (period === '3m')     { from = new Date(now); to = new Date(now); to.setMonth(to.getMonth() + 3); }
            else if (period === '6m')     { from = new Date(now); to = new Date(now); to.setMonth(to.getMonth() + 6); }
            else if (period === 'year')   { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31); }
            else if (period === 'past')   { to = new Date(now); }
            else if (period === 'future') { from = new Date(now); }
            events = events.filter(e => {
                const d = new Date(e.date);
                return (!from || d >= from) && (!to || d <= to);
            });
        }
        return events;
    },

    planningStats() {
        const events = this.filteredListEvents || [];
        const conf = events.filter(e => e.status === 'conf' || e.stage === 'won');
        const opt  = events.filter(e => (e.stage === 'option' || e.stage === 'contract' || e.status === 'opt') && e.stage !== 'won');
        return {
            total: events.filter(e => e.stage !== 'ann' && e.status !== 'ann').length,
            conf: conf.length,
            opt: opt.length,
            ca:    conf.reduce((s, e) => s + (Number(e.fee) || 0), 0),
            caOpt: opt.reduce((s, e)  => s + (Number(e.fee) || 0), 0),
        };
    },

    hasActiveMailingFilters() {
        const f = this.mailingTagFilter || {};
        return ['categories', 'genres', 'reseaux', 'keywords'].some(k => f[k] && f[k].length > 0);
    },

    previewContact() {
        if (!this.selectedMailingContacts || !this.selectedMailingContacts.length) return null;
        return this.selectedMailingContacts[
            Math.min(this.previewContactIndex || 0, this.selectedMailingContacts.length - 1)
        ] || null;
    },
};

export const planningMethods = {
    // --- TÂCHES ---
    getTypeIcon(t) {
        const i = { call: 'fas fa-phone text-blue-500', email: 'fas fa-envelope text-orange-500', admin: 'fas fa-file-contract text-purple-500', meeting: 'fas fa-handshake text-green-500', relance: 'fas fa-bell text-orange-500', other: 'fas fa-thumbtack text-slate-500' };
        return i[t] || i.other;
    },

    getTypeName(t) {
        const n = { call: 'Appel', email: 'Email', admin: 'Admin', meeting: 'RDV', relance: 'Relance', other: 'Autre' };
        return n[t] || 'Autre';
    },

    getRelatedName(t) {
        if (!t.relType || !t.relId) return '';
        if (t.relType === 'contact') { const c = this.filteredContacts.find(x => x.id === t.relId); return c ? c.name : 'Inconnu'; }
        if (t.relType === 'structure') { const s = this.db.structures.find(x => x.id === t.relId); return s ? s.name : 'Inconnu'; }
        if (t.relType === 'project') { const p = this.db.projects.find(x => x.id === t.relId); return p ? p.name : 'Inconnu'; }
        if (t.relType === 'event') { const e = this.db.events.find(x => x.id === t.relId); return e ? `${e.date ? this.formatDate(e.date) : 'Affaire'} - ${e.venueName}` : 'Inconnue'; }
        return '';
    },

    openTaskModal(task = null, context = null, prefillDate = null) {
        if (task) {
            this.editTaskData = JSON.parse(JSON.stringify(task));
        } else {
            let dDate = '';
            if (prefillDate) {
                const d = new Date(prefillDate);
                dDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            this.editTaskData = {
                id: null, text: '', type: 'call', dueDate: dDate, done: false,
                relType: context ? context.relType : '',
                relId:   context ? context.relId   : '',
            };
        }
        this.showTaskModal = true;
    },

    saveTask() {
        if (!this.editTaskData.text) return Swal.fire('Erreur', 'Action obligatoire.', 'warning');
        if (!this.editTaskData.id) {
            this.editTaskData.id = Date.now();
            this.db.tasks.push(this.editTaskData);
        } else {
            const idx = this.db.tasks.findIndex(x => x.id === this.editTaskData.id);
            if (idx >= 0) this.db.tasks[idx] = this.editTaskData;
        }
        this.saveDB();
        this.showTaskModal = false;
    },

    async toggleTaskDone(t) {
        if (!t.done) {
            const { value: text } = await Swal.fire({
                title: 'Tâche terminée !',
                input: 'textarea',
                inputLabel: 'Un compte-rendu ? (Optionnel)',
                showCancelButton: true,
                confirmButtonText: 'Valider',
                cancelButtonText: 'Annuler',
                confirmButtonColor: '#10b981'
            });
            if (text !== undefined) {
                t.done = true;
                t.doneDate = new Date().toISOString();
                t.notes = text;
                this.saveDB();
                // Relance d'affaire terminée : proposer la suivante
                if (t.type === 'relance' && t.relType === 'event') this._proposeNextRelance(t.relId);
            }
        } else {
            t.done = false;
            this.saveDB();
        }
    },

    // Les trois suppressions de ce module passaient par le confirm() natif du
    // navigateur, alors que tout le reste de l'application utilise SweetAlert2 :
    // rendu dépareillé, et dialogues natifs bloqués par certains navigateurs en
    // mode application installée. On passe le texte par « text: » et non
    // « html: » — aucune donnée saisie n'est interprétée comme du HTML.
    async deleteTask(t) {
        const r = await Swal.fire({
            title: 'Supprimer cette tâche ?',
            text:  t.text || '',
            icon:  'warning',
            showCancelButton:   true,
            confirmButtonText:  'Supprimer',
            cancelButtonText:   'Annuler',
            confirmButtonColor: '#ef4444',
        });
        if (!r.isConfirmed) return;
        this.db.tasks = this.db.tasks.filter(x => x.id !== t.id);
        this.saveDB();
    },

    // --- CALENDRIER ---
    changeMonth(delta) {
        const d = new Date(this.currentDate);
        d.setMonth(d.getMonth() + delta);
        this.currentDate = d;
    },

    toggleAllProjects() {
        if (this.isAllProjectsSelected) this.selectedProjectIds = [];
        else this.selectedProjectIds = this.db.projects.map(p => p.id);
    },

    handleCalendarClick(date) {
        if (!date) return;
        Swal.fire({
            title: 'Ajouter à cette date',
            html: 'Que souhaitez-vous créer au <b>' + this.formatDate(date) + '</b> ?',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-calendar-plus"></i> Affaire',
            denyButtonText: '<i class="fas fa-tasks"></i> Tâche',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#4f46e5',
            denyButtonColor: '#f43f5e',
        }).then(result => {
            if (result.isConfirmed) this.openEventModal(date);
            else if (result.isDenied) this.openTaskModal(null, null, date);
        });
    },

    // --- ÉVÉNEMENTS ---
    // openEventModal() est défini dans modules/venueMethods.js (point d'entrée unique).

    updateVenueInfoFromSelect() {
        const s = this.db.structures.find(x => x.id === this.editEventData.venueId);
        if (s) { this.editEventData.venueName = s.name; this.editEventData.city = s.city; }
    },

    // ── STADE D'UNE AFFAIRE : une seule règle ──
    // Partagée par le formulaire (saveEvent), le glisser-déposer du pipeline (dropEvent)
    // et le menu de stade de la fiche contact (changeEventStage). Le statut découle du
    // stade : won → conf, option/contract → opt, ann → ann, sinon prospect.
    _statusForStage(stage) {
        if (stage === 'won') return 'conf';
        if (stage === 'option' || stage === 'contract') return 'opt';
        if (stage === 'ann') return 'ann';
        return 'prospect';
    },

    // Ce qui manque pour confirmer une affaire : [] si la date et le cachet sont renseignés.
    missingForConfirmation(ev) {
        const missing = [];
        if (!ev || !ev.date) missing.push('la date');
        const fee = ev ? ev.fee : null;
        if (fee === '' || fee === null || fee === undefined || Number.isNaN(Number(fee))) missing.push('le cachet');
        return missing;
    },

    _warnMissingForConfirmation(missing) {
        return Swal.fire({
            title: 'Affaire non confirmable',
            html: 'Pour passer une affaire à <b>Confirmé</b>, renseignez ' + missing.join(' et ') + '.',
            icon: 'warning',
            confirmButtonColor: '#4f46e5',
        });
    },

    // Une affaire annulée n'a plus de relance à faire (même raisonnement que deleteEvent)
    _removeOpenRelance(eventId) {
        this.db.tasks = (this.db.tasks || []).filter(t => !(t.type === 'relance' && !t.done && t.relType === 'event' && String(t.relId) === String(eventId)));
    },

    // Change le stade d'une affaire de db.events (menu de la fiche contact, glisser-déposer).
    // Retourne true si le stade a été appliqué, false s'il est refusé ou inchangé.
    changeEventStage(ev, stage) {
        if (!ev || !stage) return false;
        const status = this._statusForStage(stage);
        if (ev.stage === stage && ev.status === status) return false;
        if (stage === 'won') {
            const missing = this.missingForConfirmation(ev);
            if (missing.length) { this._warnMissingForConfirmation(missing); return false; }
        }
        ev.stage  = stage;
        ev.status = status;
        if (stage === 'ann') this._removeOpenRelance(ev.id);
        this.saveDB();
        return true;
    },

    saveEvent() {
        const d = this.editEventData;
        if (!d.projectId) return Swal.fire('Erreur', 'Projet obligatoire', 'warning');
        // Le stade pilote le statut, mais seulement s'il change. Une affaire ancienne ou
        // importée dont stade et statut ne concordent pas est normalisée comme avant
        // (statut « conf » → stade « won ») sans être rétrogradée à l'insu de l'utilisateur.
        const prev = d.id ? this.db.events.find(e => e.id === d.id) : null;
        if (!prev || prev.stage !== d.stage) {
            if (d.stage === 'won') {
                const missing = this.missingForConfirmation(d);
                if (missing.length) return this._warnMissingForConfirmation(missing);
            }
            d.status = this._statusForStage(d.stage);
        }
        else if (d.stage === 'won') d.status = 'conf';
        else if (d.stage === 'option' || d.stage === 'contract') d.status = 'opt';
        else if (d.status === 'conf') d.stage = 'won';
        if (!d.id) {
            d.id = Date.now();
            this.db.events.push(d);
        } else {
            const idx = this.db.events.findIndex(e => e.id === d.id);
            if (idx >= 0) this.db.events[idx] = d;
        }
        if (d.stage === 'ann') this._removeOpenRelance(d.id);
        this.saveDB();
        this.closeEventModal();
    },

    async deleteEvent() {
        const r = await Swal.fire({
            title: 'Supprimer cette affaire ?',
            text:  'Cette suppression est définitive.',
            icon:  'warning',
            showCancelButton:   true,
            confirmButtonText:  'Supprimer',
            cancelButtonText:   'Annuler',
            confirmButtonColor: '#ef4444',
        });
        if (!r.isConfirmed) return;
        const delId = this.editEventData.id;
        this.db.events = this.db.events.filter(e => e.id !== delId);
        // La relance encore ouverte de cette affaire n'a plus de sens
        this.db.tasks = (this.db.tasks || []).filter(t => !(t.type === 'relance' && !t.done && t.relType === 'event' && String(t.relId) === String(delId)));
        this.saveDB();
        this.closeEventModal();
    },

    // --- PIPELINE KANBAN ---
    getPipelineEvents(stageId) {
        return this.db.events
            .filter(e => {
                const isStage = (e.stage || 'lead') === stageId;
                const isProj  = this.pipelineFilterProj === '' || e.projectId === this.pipelineFilterProj;
                return isStage && isProj;
            })
            .sort((a, b) => {
                if (a.date && b.date) return new Date(a.date) - new Date(b.date);
                if (a.date) return -1;
                if (b.date) return 1;
                return b.id - a.id;
            });
    },

    dragStart(evt, eventId) {
        this.draggedEventId = eventId;
        evt.dataTransfer.effectAllowed = 'move';
    },

    dropEvent(evt, targetStageId) {
        if (!this.draggedEventId) return;
        const ev = this.db.events.find(x => x.id === this.draggedEventId);
        this.draggedEventId = null;
        if (ev) this.changeEventStage(ev, targetStageId);
    },

    // --- PROJETS ---
    getProjectStats(projectId) {
        const evts = this.db.events.filter(e => e.projectId === projectId);
        const confs = evts.filter(e => e.status === 'conf' || e.stage === 'won');
        const opts  = evts.filter(e => e.stage !== 'won' && e.stage !== 'ann');
        return {
            conf: confs.length,
            opt:  opts.length,
            ca:   confs.reduce((sum, e) => sum + (parseFloat(e.fee) || 0), 0),
        };
    },

    openProjectModal(p = null) {
        if (p) { this.editProjectData = JSON.parse(JSON.stringify(p)); this.isEditingProject = false; }
        else   { this.editProjectData = { id: null, name: '', genre: '', duration: '', defaultFee: 0, feeType: 'HT', teamSize: 1, expenses: '',
              linkVideo: '', linkPress: '', linkTech: '', linkTree: '',
              icon: 'fas fa-music', color: '#3b82f6',
              // Fiche artiste
              bio:             '',
              members:         '',
              artistNote:      '',
              minFee:          0,
              contractTypes:   '',
              fraisRoute:      '',
              linkSpotify:     '',
              linkInstagram:   '',
              linkFacebook:    '',
              linkAppleMusic:  '',
              linkBandcamp:    '',
              linkDeezer:      '',
              photoLinks:      '',
              labelDistrib:    '',
              productionYear:  '',
            }; this.isEditingProject = true; }
        this.showProjectModal = true;
    },

    saveProject() {
        if (!this.editProjectData.name) return Swal.fire('Erreur', 'Nom du projet obligatoire.', 'warning');
        if (!this.editProjectData.id) {
            this.editProjectData.id = Date.now();
            this.db.projects.push(this.editProjectData);
            this.selectedProjectIds.push(this.editProjectData.id);
        } else {
            const idx = this.db.projects.findIndex(x => x.id === this.editProjectData.id);
            if (idx >= 0) this.db.projects[idx] = this.editProjectData;
        }
        this.saveDB();
        this.isEditingProject = false;
    },

    async deleteProject(p) {
        const r = await Swal.fire({
            title: 'Supprimer ce projet ?',
            text:  p.name || '',
            icon:  'warning',
            showCancelButton:   true,
            confirmButtonText:  'Supprimer',
            cancelButtonText:   'Annuler',
            confirmButtonColor: '#ef4444',
        });
        if (!r.isConfirmed) return;
        this.db.projects = this.db.projects.filter(x => x.id !== p.id);
        this.selectedProjectIds = this.selectedProjectIds.filter(id => id !== p.id);
        this.saveDB();
        this.showProjectModal = false;
    },

    calculateBreakEven(e) {
        const partBillet = (e.ticketPrice || 0) * ((e.corealPercentage || 0) / 100);
        return partBillet > 0 ? Math.ceil((e.tourExpenses || 0) / partBillet) : 0;
    },

    calculateEstRevenue(e) {
        const ticketsSold = (e.capacity || 0) * ((e.estFillRate || 100) / 100);
        return ticketsSold * (e.ticketPrice || 0) * ((e.corealPercentage || 0) / 100);
    },

    applyCorealRevenue() {
        this.editEventData.fee = this.calculateEstRevenue(this.editEventData);
    },

    // --- MAILING ---
    toggleSelectAll() {
        const filtered = this.filteredMailingContacts;
        const allSelected = filtered.every(c => this.selectedMailingContacts.some(sc => sc.id === c.id));
        if (allSelected) {
            this.selectedMailingContacts = this.selectedMailingContacts.filter(sc => !filtered.some(fc => fc.id === sc.id));
        } else {
            filtered.forEach(c => {
                if (!this.selectedMailingContacts.some(sc => sc.id === c.id))
                    this.selectedMailingContacts.push(c);
            });
        }
    },

    isContactSelected(c) {
        return this.selectedMailingContacts.some(sc => sc.id === c.id);
    },

    toggleContactSelection(c) {
        if (this.isContactSelected(c))
            this.selectedMailingContacts = this.selectedMailingContacts.filter(sc => sc.id !== c.id);
        else
            this.selectedMailingContacts.push(c);
    },

    applyTemplate() {
        const tpl = (this.db.templates || []).find(t => t.id === this.selectedTemplateId);
        if (tpl) { this.mailSubject = tpl.subject; this.mailBody = tpl.body; }
    },

    // Remplace les variables {{...}} dans un texte
    parseMailVars(text, contact, includeUnsubscribe = false) {
        if (!text || !contact) return text || '';
        const unsubLink = includeUnsubscribe
            ? `[Pour vous désinscrire, répondez à cet email avec "DÉSINSCRIPTION"]`
            : '';
        return text
            .replace(/{{contactName}}/g,      contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '')
            .replace(/{{contactFirstName}}/g,  contact.firstName || contact.name || '')
            .replace(/{{contactLastName}}/g,   contact.lastName  || '')
            .replace(/{{contactRole}}/g,       contact.role      || '')
            .replace(/{{structName}}/g,        contact.structName   || '')
            .replace(/{{structCity}}/g,        contact.structCity   || '')
            .replace(/{{structRegion}}/g,      contact.structRegion || '')
            .replace(/{{userName}}/g,          this.currentUserName || this.currentUser || '')
            .replace(/{{unsubscribeLink}}/g,   unsubLink);
    },

    async executeMailing() {
        if (!this.selectedMailingContacts.length)
            return Swal.fire('Erreur', 'Sélectionnez au moins un destinataire.', 'warning');
        if (!this.mailSubject || !this.mailBody)
            return Swal.fire('Erreur', 'Le sujet et le corps du message sont obligatoires.', 'warning');

        const total    = this.selectedMailingContacts.length;
        const hasVars  = /{{contact|{{struct/.test(this.mailBody + this.mailSubject);
        const addUnsub = this.mailingAddUnsubscribe;

        // Confirmation avant envoi
        const confirmation = await Swal.fire({
            title: `Envoyer à ${total} contact(s) ?`,
            html: `<div class="text-left text-sm space-y-1 mt-2">
                <div><b>Objet :</b> ${this.sanitizeText(this.mailSubject, 100)}</div>
                <div><b>Personnalisation :</b> ${hasVars ? '✓ Variables activées — file envoi individuelle' : '— Aucune variable — envoi groupé BCC'}</div>
                <div><b>Lien désinscription :</b> ${addUnsub ? '✓ Inclus' : '— Non inclus'}</div>
            </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            confirmButtonText: `Préparer ${total} email(s)`,
            cancelButtonText: 'Annuler',
        });
        if (!confirmation.isConfirmed) return;

        // Préparer tous les emails
        const recipients = [];
        for (let i = 0; i < total; i++) {
            const c = this.selectedMailingContacts[i];
            const email = c.primaryEmail || c.emailPro;
            if (!email) continue;
            const body    = this.parseMailVars(this.mailBody,    c, addUnsub);
            const subject = this.parseMailVars(this.mailSubject, c, false);
            recipients.push({
                name:    c.name || (`${c.firstName || ''} ${c.lastName || ''}`).trim(),
                email,
                struct:  c.structName,
                body,
                subject,
            });
        }

        if (!recipients.length) return Swal.fire('Erreur', 'Aucun email valide dans la sélection.', 'warning');

        if (hasVars) {
            // ── Mode personnalisé : file d'envoi individuelle ──────────────────
            await this._runMailQueue(recipients, addUnsub);
        } else {
            // ── Mode groupé : BCC classique ────────────────────────────────────
            const bccList   = recipients.map(r => r.email).join(',');
            const bodyFinal = this.parseMailVars(this.mailBody, { userName: this.currentUserName }, addUnsub);
            window.open(`mailto:?bcc=${bccList}&subject=${encodeURIComponent(this.mailSubject)}&body=${encodeURIComponent(bodyFinal)}`, '_blank');
            this._saveCampaignHistory(recipients, hasVars, addUnsub);
            Swal.fire({
                title: 'Campagne lancée ✓',
                html: `<b>${recipients.length}</b> destinataire(s) en BCC.<br><span class="text-sm text-slate-500">Votre client de messagerie a été ouvert.</span>`,
                icon: 'success', confirmButtonColor: '#4f46e5',
            });
            this.selectedMailingContacts = [];
        }
    },

    // File d'envoi individuelle pour les emails personnalisés
    async _runMailQueue(recipients, addUnsub) {
        const total = recipients.length;
        let current = 0;

        // Stocker l'email courant accessible depuis les boutons onclick
        window._bobMailQueue = recipients;

        const showEmail = (idx) => {
            const r = recipients[idx];
            const isLast = idx === total - 1;
            const pct = Math.round((idx + 1) / total * 100);
            const bodyEscaped = r.body.split('<').join('&lt;').split('>').join('&gt;');

            Swal.fire({
                title: `Email ${idx + 1} / ${total}`,
                html: `<div style="text-align:left">
                    <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px">
                        <div><b>A :</b> ${r.name} &lt;${r.email}&gt;</div>
                        <div style="color:#64748b;font-size:11px">${r.struct || ''}</div>
                    </div>
                    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:4px">Objet :</div>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;font-size:13px;margin-bottom:10px">${r.subject}</div>
                    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:4px">Message :</div>
                    <div id="swal-mail-body" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;font-size:12px;white-space:pre-wrap;max-height:160px;overflow-y:auto;line-height:1.6;color:#374151">${bodyEscaped}</div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button id="btn-copy-all" onclick="var r=window._bobMailQueue[${idx}];navigator.clipboard.writeText('A : '+r.email+'\nObjet : '+r.subject+'\n\n'+r.body).then(function(){var b=document.getElementById('btn-copy-all');b.textContent='Copie!';b.style.background='#10b981';b.style.color='white';setTimeout(function(){b.textContent='Tout copier';b.style.background='';b.style.color='';},2000);});" style="flex:1;padding:7px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Tout copier</button>
                        <button id="btn-copy-body" onclick="var r=window._bobMailQueue[${idx}];navigator.clipboard.writeText(r.body).then(function(){var b=document.getElementById('btn-copy-body');b.textContent='Corps copie!';b.style.background='#10b981';b.style.color='white';setTimeout(function(){b.textContent='Corps seul';b.style.background='';b.style.color='';},2000);});" style="flex:1;padding:7px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Corps seul</button>
                    </div>
                    <div style="margin-top:12px">
                        <div style="background:#e2e8f0;border-radius:99px;height:4px;overflow:hidden">
                            <div style="background:#4f46e5;height:4px;width:${pct}%;border-radius:99px"></div>
                        </div>
                        <div style="font-size:10px;color:#94a3b8;margin-top:4px;text-align:right">${idx + 1} / ${total}</div>
                    </div>
                </div>`,
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: isLast ? 'Terminer' : 'Suivant',
                denyButtonText: 'Ouvrir messagerie',
                cancelButtonText: 'Arreter',
                confirmButtonColor: isLast ? '#10b981' : '#4f46e5',
                denyButtonColor: '#64748b',
                allowOutsideClick: false,
                width: 560,
            }).then(result => {
                if (result.isConfirmed) {
                    const next = idx + 1;
                    if (next < total) {
                        showEmail(next);
                    } else {
                        this._saveCampaignHistory(recipients, true, addUnsub);
                        Swal.fire({
                            title: 'Campagne terminee',
                            html: `<b>${total}</b> email(s) traites et enregistres dans l'historique.`,
                            icon: 'success', confirmButtonColor: '#4f46e5',
                        });
                        this.selectedMailingContacts = [];
                    }
                } else if (result.isDenied) {
                    window.open('mailto:' + r.email + '?subject=' + encodeURIComponent(r.subject) + '&body=' + encodeURIComponent(r.body), '_blank');
                    showEmail(idx);
                } else {
                    const done = recipients.slice(0, idx);
                    if (done.length) {
                        this._saveCampaignHistory(done, true, addUnsub);
                        Swal.fire({
                            title: 'Envoi interrompu',
                            html: '<b>' + done.length + '</b> email(s) traites sur ' + total + '.',
                            icon: 'info', confirmButtonColor: '#f59e0b',
                        });
                    }
                }
            });
        };

        showEmail(0);
    },


    // Enregistre la campagne dans l'historique
    _saveCampaignHistory(recipients, hasVars, addUnsub) {
        if (!this.db.campaignHistory) this.db.campaignHistory = [];
        this.db.campaignHistory.unshift({
            id:             Date.now(),
            date:           new Date().toISOString(),
            sentBy:         this.currentUserName || this.currentUser,
            subject:        this.mailSubject,
            body:           this.mailBody,
            recipientCount: recipients.length,
            hasVars,
            addUnsub,
            recipients:     recipients.map(r => ({ name: r.name, email: r.email, struct: r.struct })),
        });
        this.saveDB();
    },

    // Renvoyer une campagne depuis l'historique
    resendCampaign(campaign) {
        this.mailSubject = campaign.subject;
        this.mailBody    = campaign.body;
        this.mailingActiveTab = 'compose';
        Swal.fire({
            title: 'Campagne chargée ✓',
            html: 'Le sujet et le corps ont été rechargés.<br><span class="text-sm text-slate-500">Sélectionnez les destinataires et envoyez.</span>',
            icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false,
        });
    },

    // Marquer un contact comme désinscrit
    unsubscribeContact(email) {
        if (!email) return;
        let found = false;
        this.db.structures.forEach(s => {
            (s.contacts || []).forEach(c => {
                if ((c.emailPro || c.emailPerso || '').toLowerCase() === email.toLowerCase()) {
                    c.isUnsubscribed = true;
                    found = true;
                }
            });
        });
        if (found) {
            this.saveDB();
            Swal.fire({ title: 'Contact désinscrit', icon: 'info', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        }
    },

    // --- RELANCES AUTOMATIQUES ---

    // Délais par défaut selon l'étape
    _defaultRelanceDelay(stage) {
        const delays = { lead: 14, contact: 10, nego: 7, option: 3, contract: 2 };
        return delays[stage] || 7;
    },

    // Définir une date de relance sur une affaire
    // --- RELANCES D'AFFAIRE = TÂCHES ---
    // Depuis la v44, une relance est une tâche ordinaire (db.tasks) :
    // type 'relance', relType 'event', relId = id de l'affaire.
    // Elle apparaît donc dans Tâches & Suivi, l'agenda et le pipeline.
    // Une seule relance ouverte par affaire.
    getEventRelance(eventId) {
        if (eventId === null || eventId === undefined || eventId === '') return null;
        const eid = String(eventId);
        return (this.db.tasks || []).find(t => !t.done && t.type === 'relance' && t.relType === 'event' && String(t.relId) === eid) || null;
    },

    isRelanceOverdue(t) {
        return !!(t && t.dueDate && t.dueDate < this._todayIso());
    },

    _todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    _isoIn(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    _relanceText(e, note) {
        return note ? 'Relance : ' + note : 'Relancer ' + (e.venueName || e.city || "l'organisateur");
    },

    // Crée ou met à jour la relance ouverte d'une affaire
    _upsertRelance(e, date, note) {
        if (!this.db.tasks) this.db.tasks = [];
        const existing = this.getEventRelance(e.id);
        if (existing) {
            existing.dueDate     = date;
            existing.relanceNote = note || '';
            existing.text        = this._relanceText(e, note);
            return existing;
        }
        let id = Date.now();
        while (this.db.tasks.some(x => x.id === id)) id++;   // plusieurs relances créées dans la même milliseconde (migration)
        const t = {
            id:          id,
            text:        this._relanceText(e, note),
            type:        'relance',
            dueDate:     date,
            dueTime:     '',
            done:        false,
            relType:     'event',
            relId:       e.id,
            relanceNote: note || '',
        };
        this.db.tasks.push(t);
        return t;
    },

    async setRelanceDate(e, autoDelay = null) {
        if (!e || !e.id) return Swal.fire('Erreur', "Enregistrez d'abord l'affaire.", 'warning');
        const current = this.getEventRelance(e.id);
        const delay = autoDelay || this._defaultRelanceDelay(e.stage || 'lead');
        const defaultStr = current ? current.dueDate : this._isoIn(delay);
        const noteStr = current ? (current.relanceNote || '') : '';
        const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

        const r = await Swal.fire({
            title: `Relance — ${e.venueName || 'Affaire'}`,
            html: `<div class="text-left space-y-3 mt-2">
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Date de relance</label>
                    <input id="swal-relance-date" type="date" class="swal2-input !mt-0" value="${defaultStr}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Note (optionnelle)</label>
                    <input id="swal-relance-note" class="swal2-input !mt-0" placeholder="Ex: Attendre retour budget..." value="${esc(noteStr)}">
                </div>
                <div class="flex gap-2 mt-1">
                    ${[3,7,14,30].map(d => `<button type="button" data-days="${d}"
                                class="flex-1 text-xs bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded-lg font-bold transition">+${d}j</button>`).join('')}
                </div>
            </div>`,
            showCancelButton: true,
            confirmButtonText: current ? 'Modifier la relance' : 'Définir la relance',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#4f46e5',
            focusConfirm: false,
            // SweetAlert2 supprime les onclick : les raccourcis passent par didOpen()
            didOpen: (popup) => {
                popup.querySelectorAll('[data-days]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        popup.querySelector('#swal-relance-date').value = this._isoIn(Number(btn.dataset.days));
                    });
                });
            },
            preConfirm: () => {
                const date = document.getElementById('swal-relance-date').value;
                if (!date) return Swal.showValidationMessage('Choisissez une date');
                return { date, note: document.getElementById('swal-relance-note').value.trim() };
            }
        });
        if (!r.isConfirmed) return;

        const ev = this.db.events.find(x => x.id === e.id) || e;
        this._upsertRelance(ev, r.value.date, r.value.note);
        this.saveDB();
        Swal.fire({ title: 'Relance planifiée ✓', html: `Le ${this.formatDate(r.value.date)}`, icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    // Relance effectuée (depuis le tableau de bord) : la tâche passe dans l'Historique
    async markRelanceDone(e) {
        const t = this.getEventRelance(e.id);
        if (!t) return;
        const { value: text } = await Swal.fire({
            title: 'Relance effectuée ✓',
            input: 'textarea',
            inputLabel: 'Un compte-rendu ? (Optionnel)',
            showCancelButton: true,
            confirmButtonText: 'Valider',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#10b981',
        });
        if (text === undefined) return;
        t.done     = true;
        t.doneDate = new Date().toISOString();
        t.notes    = text;
        this.saveDB();
        this._proposeNextRelance(e.id);
    },

    async _proposeNextRelance(eventId) {
        const ev = this.db.events.find(x => String(x.id) === String(eventId));
        if (!ev || ev.stage === 'won' || ev.stage === 'ann') return;
        const r = await Swal.fire({
            title: 'Prochaine relance ?',
            html: `Voulez-vous planifier une prochaine relance pour <strong>${ev.venueName || 'cette affaire'}</strong> ?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Planifier une relance',
            cancelButtonText: 'Non merci',
            confirmButtonColor: '#4f46e5',
        });
        if (r.isConfirmed) await this.setRelanceDate(ev);
    },

    // Migration : anciennes relances (e.relanceDate) → tâches. Idempotente,
    // appelée à chaque chargement des données privées. Les affaires confirmées
    // ou annulées gardent leur ancien champ, invisible comme avant.
    _migrateRelancesToTasks() {
        let changed = false;
        (this.db.events || []).forEach(e => {
            if (!e.relanceDate || e.relanceDone) return;
            if (e.stage === 'won' || e.stage === 'ann') return;
            this._upsertRelance(e, e.relanceDate, e.relanceNote || '');
            delete e.relanceDate;
            delete e.relanceNote;
            changed = true;
        });
        return changed;
    },

    // Email de relance pré-rempli
    sendRelanceEmail(e) {
        const contact = e.contactEmail || '';
        const subject = encodeURIComponent(`Relance — ${e.venueName || 'Notre projet'}`);
        const body    = encodeURIComponent(
            `Bonjour,

Je me permets de revenir vers vous concernant notre projet ${this.getProjectName(e.projectId) || ''} ` +
            `pour une date à ${e.city || e.venueName || ''}.

Avez-vous eu l'occasion d'étudier notre proposition ?

` +
            `Cordialement,
${this.currentUserName}`
        );
        window.location.href = `mailto:${contact}?subject=${subject}&body=${body}`;
    },

    // Alerte de relances au démarrage
    showRelanceAlert() {
        const overdue = this.affairesRelanceOverdue || [];
        const soon    = (this.affairesToRelance || []).filter(e => !this.affairesRelanceOverdue.some(x => x.id === e.id));
        const lines = [];
        if (overdue.length) lines.push(`<li class="text-red-600 font-bold">⚠ ${overdue.length} relance(s) en retard</li>`);
        if (soon.length)    lines.push(`<li class="text-orange-600">📅 ${soon.length} relance(s) dans les 48h</li>`);

        Swal.fire({
            title: 'Relances à effectuer',
            html: `<ul class="text-left space-y-2 mt-2">${lines.join('')}</ul>
                   <p class="text-xs text-slate-400 mt-3">Accédez au pipeline pour les traiter.</p>`,
            icon: overdue.length ? 'warning' : 'info',
            showCancelButton: true,
            confirmButtonText: 'Voir le pipeline',
            cancelButtonText: 'Plus tard',
            confirmButtonColor: '#f59e0b',
        }).then(r => { if (r.isConfirmed) this.tab = 'pipeline'; });
    },

    // --- MODÈLES DE CONTRATS ---
    getDefaultContractBody() {
        return `ENTRE LES SOUSSIGNÉS :

La production : {{producteur}} d'une part,
ET l'organisateur : {{lieu}} à {{ville}} d'autre part.

# ARTICLE 1 : OBJET
L'organisateur engage la production pour la représentation du spectacle "{{artiste}}"
Date : {{date}} à {{heure}}
Durée : {{duree}}

# ARTICLE 2 : CONDITIONS FINANCIÈRES
L'organisateur s'engage à verser à la production un cachet de :
{{cachet}} {{cachetType}}

# ARTICLE 3 : CONDITIONS TECHNIQUES
La fiche technique sera transmise à la signature du présent contrat.
Équipe en déplacement : {{teamSize}} personne(s)
Frais de route : {{fraisRoute}}

# ARTICLE 4 : DISPOSITIONS GÉNÉRALES
Le présent contrat est soumis à la législation française.
Toute modification devra faire l'objet d'un avenant écrit signé des deux parties.`;
    },

    saveContractTemplate() {
        const tpl = this.editingContractTpl;
        if (!tpl) return;
        if (!tpl.name) return Swal.fire('Erreur', 'Le nom du modèle est obligatoire.', 'warning');
        if (!tpl.body) return Swal.fire('Erreur', 'Le corps du contrat est obligatoire.', 'warning');

        if (!this.db.contractTemplates) this.db.contractTemplates = [];

        if (!tpl.id) {
            tpl.id = 'ct' + Date.now();
            this.db.contractTemplates.push({ ...tpl });
        } else {
            const idx = this.db.contractTemplates.findIndex(t => t.id === tpl.id);
            if (idx >= 0) this.db.contractTemplates[idx] = { ...tpl };
        }

        this.saveDB();
        this.editingContractTpl = null;
        Swal.fire({ title: 'Modèle enregistré ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    // --- TEMPLATES ---
    openTemplateModal(tpl = null) {
        this.editTemplateData = tpl
            ? JSON.parse(JSON.stringify(tpl))
            : { id: null, name: '', subject: '', body: '' };
        this.showTemplateModal = true;
    },

    saveTemplate() {
        if (!this.editTemplateData.name) return Swal.fire('Erreur', 'Nom obligatoire.', 'warning');
        if (!this.db.templates) this.db.templates = [];
        if (!this.editTemplateData.id) {
            this.editTemplateData.id = 't' + Date.now();
            this.db.templates.push(this.editTemplateData);
        } else {
            const idx = this.db.templates.findIndex(t => t.id === this.editTemplateData.id);
            if (idx >= 0) this.db.templates[idx] = this.editTemplateData;
        }
        this.saveDB();
        this.showTemplateModal = false;
    },

    deleteTemplate(tpl) {
        Swal.fire({ title: 'Supprimer ce template ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
            .then(r => {
                if (r.isConfirmed) {
                    this.db.templates = (this.db.templates || []).filter(t => t.id !== tpl.id);
                    this.saveDB();
                }
            });
    },

    // --- FILTRES MAILING PAR TAGS ---
    toggleMailingTagFilter(family, tag) {
        if (!this.mailingTagFilter) this.mailingTagFilter = {};
        if (!this.mailingTagFilter[family]) this.mailingTagFilter[family] = [];
        const idx = this.mailingTagFilter[family].indexOf(tag);
        if (idx > -1) this.mailingTagFilter[family].splice(idx, 1);
        else this.mailingTagFilter[family].push(tag);
    },

    isTagFilterActive(family, tag) {
        return !!(this.mailingTagFilter && this.mailingTagFilter[family] && this.mailingTagFilter[family].includes(tag));
    },

    clearMailingFilters() {
        this.mailingTagFilter = {};
    },

    // --- EXPORT DEPUIS LA CARTE ---
    exportMailingListExcel() {
        try {
            if (!this.selectedMailingContacts || !this.selectedMailingContacts.length) {
                Swal.fire('Liste vide', "Aucun contact trouvé. Cliquez sur la carte pour définir une zone.", 'warning');
                return;
            }
            const rows = this.selectedMailingContacts.map(c => ({
                'Structure':     c.structName    || '',
                'Adresse':       c.structAddress  || '',
                'Code Postal':   c.structZip      || '',
                'Ville':         c.structCity     || '',
                'Tél Structure': c.structPhone    || '',
                'Prénom':        c.firstName      || '',
                'Nom':           c.lastName       || c.name || '',
                'Fonction':      c.role           || '',
                'Email Pro':     c.emailPro       || '',
                'Email Perso':   c.emailPerso     || '',
                'Mobile Pro':    c.mobilePro      || '',
                'Tél Direct':    c.phoneDirect    || '',
                'VIP':           c.isVip ? 'OUI' : 'NON',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Prospection Géographique');
            XLSX.writeFile(wb, `Export_Prospection_${this.searchRadius}km.xlsx`);
        } catch (err) {
            console.error('[exportMailingListExcel]', err);
            Swal.fire('Erreur', "Le fichier Excel n'a pas pu être généré.", 'error');
        }
    },

    // Export CSV pour Brevo / Sendinblue
    exportToBrevo() {
        if (!this.selectedMailingContacts.length) return;
        const rows = this.selectedMailingContacts.map(c => ({
            'EMAIL':      c.primaryEmail || c.emailPro || '',
            'PRENOM':     c.firstName    || '',
            'NOM':        c.lastName     || c.name     || '',
            'COMPANY':    c.structName   || '',
            'VILLE':      c.structCity   || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Brevo Import');
        XLSX.writeFile(wb, `brevo_import_${new Date().toISOString().slice(0, 10)}.csv`);
    },

    // Export CSV pour Mailchimp
    exportToMailchimp() {
        if (!this.selectedMailingContacts.length) return;
        const rows = this.selectedMailingContacts.map(c => ({
            'Email Address': c.primaryEmail || c.emailPro || '',
            'First Name':    c.firstName    || '',
            'Last Name':     c.lastName     || c.name     || '',
            'Company':       c.structName   || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mailchimp Import');
        XLSX.writeFile(wb, `mailchimp_import_${new Date().toISOString().slice(0, 10)}.csv`);
    },

    // --- CARTOGRAPHIE ---
    filterByGeo(centerLatLng) {
        if (!centerLatLng && this.searchCenter) centerLatLng = this.searchCenter.getLatLng();
        if (!centerLatLng) return;
        if (this.searchCenter) this.searchCenter.setRadius(this.searchRadius * 1000);
        this.geoResults = this.db.structures
            .map(s => {
                if (!s.lat) return null;
                const d = this.getDist(centerLatLng.lat, centerLatLng.lng, s.lat, s.lng);
                return d <= this.searchRadius ? { ...s, dist: d } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.dist - b.dist);
    },
};
