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
            return new Date(a.dueDate) - new Date(b.dueDate);
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
            total: events.length,
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
        const i = { call: 'fas fa-phone text-blue-500', email: 'fas fa-envelope text-orange-500', admin: 'fas fa-file-contract text-purple-500', meeting: 'fas fa-handshake text-green-500', other: 'fas fa-thumbtack text-slate-500' };
        return i[t] || i.other;
    },

    getTypeName(t) {
        const n = { call: 'Appel', email: 'Email', admin: 'Admin', meeting: 'RDV', other: 'Autre' };
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
            }
        } else {
            t.done = false;
            this.saveDB();
        }
    },

    deleteTask(t) {
        if (confirm('Supprimer cette tâche ?')) {
            this.db.tasks = this.db.tasks.filter(x => x.id !== t.id);
            this.saveDB();
        }
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
    openEventModal(date = null, event = null) {
        if (event) {
            this.editEventData = JSON.parse(JSON.stringify(event));
        } else {
            const firstProject = this.db.projects[0];
            const projectId = firstProject ? firstProject.id : '';
            let dDate = '';
            if (date) {
                const d = new Date(date);
                dDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            this.editEventData = {
                id: null, projectId, date: dDate, time: '',
                venueId: '', venueName: '', city: '',
                status: 'opt', stage: 'lead', contractType: 'cession',
                fee: firstProject ? firstProject.defaultFee : 0,
                capacity: null, ticketPrice: null, corealPercentage: null,
                tourExpenses: null, estFillRate: 80,
            };
        }
        this.showEventModal = true;
    },

    updateVenueInfoFromSelect() {
        const s = this.db.structures.find(x => x.id === this.editEventData.venueId);
        if (s) { this.editEventData.venueName = s.name; this.editEventData.city = s.city; }
    },

    saveEvent() {
        if (!this.editEventData.projectId) return Swal.fire('Erreur', 'Projet obligatoire', 'warning');
        if (this.editEventData.stage === 'won') this.editEventData.status = 'conf';
        else if (this.editEventData.stage === 'option' || this.editEventData.stage === 'contract') this.editEventData.status = 'opt';
        else if (this.editEventData.status === 'conf') this.editEventData.stage = 'won';
        if (!this.editEventData.id) {
            this.editEventData.id = Date.now();
            this.db.events.push(this.editEventData);
        } else {
            const idx = this.db.events.findIndex(e => e.id === this.editEventData.id);
            if (idx >= 0) this.db.events[idx] = this.editEventData;
        }
        this.saveDB();
        this.showEventModal = false;
    },

    deleteEvent() {
        if (confirm('Supprimer cette affaire définitivement ?')) {
            this.db.events = this.db.events.filter(e => e.id !== this.editEventData.id);
            this.saveDB();
            this.showEventModal = false;
        }
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
        if (ev) {
            ev.stage = targetStageId;
            if (targetStageId === 'won') ev.status = 'conf';
            else if (targetStageId === 'option' || targetStageId === 'contract') ev.status = 'opt';
            else if (ev.status === 'conf') ev.status = 'opt';
            this.saveDB();
        }
        this.draggedEventId = null;
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
        else   { this.editProjectData = { id: null, name: '', genre: '', duration: '', defaultFee: 0, feeType: 'HT', teamSize: 1, expenses: '', linkVideo: '', linkPress: '', linkTech: '', linkTree: '', icon: 'fas fa-music', color: '#3b82f6' }; this.isEditingProject = true; }
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

    deleteProject(p) {
        if (confirm(`Supprimer le projet ${p.name} ?`)) {
            this.db.projects = this.db.projects.filter(x => x.id !== p.id);
            this.selectedProjectIds = this.selectedProjectIds.filter(id => id !== p.id);
            this.saveDB();
            this.showProjectModal = false;
        }
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

    // Remplace les variables {{...}} dans un texte pour la prévisualisation
    parseMailVars(text, contact) {
        if (!text || !contact) return text || '';
        return text
            .replace(/{{contactName}}/g, contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '')
            .replace(/{{contactFirstName}}/g, contact.firstName || contact.name || '')
            .replace(/{{structName}}/g, contact.structName || '')
            .replace(/{{structCity}}/g, contact.structCity || '')
            .replace(/{{userName}}/g, this.currentUser || '');
    },

    executeMailing() {
        if (!this.selectedMailingContacts.length)
            return Swal.fire('Erreur', 'Sélectionnez au moins un destinataire.', 'warning');
        if (!this.mailSubject || !this.mailBody)
            return Swal.fire('Erreur', 'Le sujet et le corps du message sont obligatoires.', 'warning');

        const hasVars = this.mailBody.includes('{{contactName}}')
            || this.mailBody.includes('{{contactFirstName}}')
            || this.mailBody.includes('{{structName}}');

        if (hasVars && this.selectedMailingContacts.length > 1) {
            // Simulation envoi personnalisé
            Swal.fire({ title: 'Envoi en cours', html: `Temporisation anti-spam... <br><b>0</b>/${this.selectedMailingContacts.length}`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let count = 0;
            const total = this.selectedMailingContacts.length;
            const interval = setInterval(() => {
                count++;
                Swal.getHtmlContainer().innerHTML = `Temporisation anti-spam... <br><b>${count}</b>/${total}`;
                if (count >= total) {
                    clearInterval(interval);
                    // Enregistrement dans l'historique
                    if (!this.db.campaignHistory) this.db.campaignHistory = [];
                    this.db.campaignHistory.unshift({
                        id: Date.now(), date: new Date().toISOString(), sentBy: this.currentUser,
                        subject: this.mailSubject, body: this.mailBody,
                        recipientCount: total,
                        recipients: this.selectedMailingContacts.map(c => ({ name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim(), email: c.primaryEmail || c.emailPro, struct: c.structName }))
                    });
                    this.saveDB();
                    Swal.fire('Campagne terminée', `${total} emails personnalisés envoyés (Simulation) !`, 'success');
                    this.selectedMailingContacts = [];
                }
            }, 800);
        } else {
            const bccList = this.selectedMailingContacts.map(c => c.primaryEmail || c.emailPro).filter(Boolean).join(',');
            const bodyParsed = this.mailBody.replace(/{{userName}}/g, this.currentUser || 'Moi');
            window.location.href = `mailto:?bcc=${bccList}&subject=${encodeURIComponent(this.mailSubject)}&body=${encodeURIComponent(bodyParsed)}`;
            Swal.fire('Succès', 'Votre client de messagerie a été ouvert.', 'success');
            this.selectedMailingContacts = [];
        }
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
