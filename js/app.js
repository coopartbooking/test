// app.js — Point d'entrée Vue.js — Bob Booking

// --- IMPORTS FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD_Cu2VR2YhFMOB65-5155d2hFVaHymGwU",
    authDomain:        "bob-coop-art.firebaseapp.com",
    projectId:         "bob-coop-art",
    storageBucket:     "bob-coop-art.firebasestorage.app",
    messagingSenderId: "215864119388",
    appId:             "1:215864119388:web:fc1ff1e282a82e607c1699"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const dbFirestore = getFirestore(firebaseApp);

const { createApp, nextTick } = Vue;

// --- IMPORTS MODULES ---
import { utilsMethods }                         from './utils.js';
import { contactsComputed, contactsMethods }    from './contacts.js';
import { planningComputed, planningMethods }    from './planning.js';

// --- CONSTANTE COULEURS PAR DÉFAUT ---
const DEFAULT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

// =============================================================================
createApp({

    // ─────────────────────────────────────────────────────────────────────────
    // DATA
    // ─────────────────────────────────────────────────────────────────────────
    data() {
        return {
            // Navigation & auth
            pageTitle: 'Tableau de bord',
            currentUser: null,
            currentUserName: '',
            tab: 'dashboard',
            authEmail: '', authPassword: '', isLoginMode: true,

            // Base de données locale (miroir Firestore)
            db: {
            projects: [],
            structures: [],
            tasks: [],
            events: [],
            templates: [
                    { id: 't1', name: 'Prise de contact', subject: 'Proposition de spectacle', body: "Bonjour {{contactFirstName}},\n\nJe me permets de vous contacter concernant la programmation de {{structName}}.\nNous sommes en préparation de notre prochaine tournée...\n\nBien à vous,\n{{userName}}" }
                ],
            campaignHistory: [],
            tagCategories: [],
            tagGenres:     [],
            tagReseaux:    [],
            tagKeywords:   [],
    
            
        },

            // Planning & calendrier
            viewMode: 'calendar',
            currentDate: new Date(),
            showTasksInCalendar: true,
            selectedProjectIds: [],
            planningSearch: '',
            planningStatusFilter: 'all',
            planningPeriod: 'all',

            // Pipeline
            pipelineFilterProj: '', pipelineSearch: '', draggedEventId: null,
            pipelineCols: [
                { id: 'lead',      name: 'À contacter',    dotColor: 'bg-slate-400'   },
                { id: 'contacted', name: 'Contact établi', dotColor: 'bg-blue-400'    },
                { id: 'nego',      name: 'En négociation', dotColor: 'bg-purple-400'  },
                { id: 'option',    name: 'Option posée',   dotColor: 'bg-orange-400'  },
                { id: 'contract',  name: 'Contrat envoyé', dotColor: 'bg-yellow-400'  },
                { id: 'won',       name: 'Confirmé',       dotColor: 'bg-emerald-500' },
            ],

            // Annuaire & contacts
            searchContact: '', searchStruct: '',
            contactViewMode: 'grid',

            // Modales
            showTaskModal:    false, editTaskData:    {},
            showEventModal:   false, editEventData:   {},
            showProjectModal: false, editProjectData: {}, isEditingProject: false,
            showCrmModal:     false, currentCrmStruct: null, currentCrmContact: null,
            showTemplateModal: false, editTemplateData: {},

            // CRM
            newCrmComment: '',
            newContactComment: '',

            // Mailing
            mailingSearch: '',
            mailingActiveTab: 'compose',
            selectedMailingContacts: [],
            selectedTemplateId: '',
            mailSubject: '', mailBody: '',
            previewContactIndex: 0,
            mailingTagFilter: {},
            mailingRightTab: 'contacts',

            // Carte géographique
            map: null, miniMap: null,
            searchRadius: 50, searchCenter: null,
            geoResults: [], mapMarkers: [], searchCircle: null,
            geoTagFilter: {},

            // Recherche globale (omnibox)
            omniSearch: '', showOmniDropdown: false,

           

            // Icônes projets
            projectIcons: ['fas fa-music', 'fas fa-guitar', 'fas fa-theater-masks', 'fas fa-microphone', 'fas fa-drum', 'fas fa-compact-disc', 'fas fa-star', 'fas fa-bolt'],

            // Dropdowns modales (non utilisés mais référencés dans certains templates)
            taskRelSearch: '', showRelDropdown: false,
            eventProjectSearch: '', showEventProjectDropdown: false,
            eventVenueSearch: '', showEventVenueDropdown: false,

            // Statut de synchronisation Firebase : 'idle' | 'saving' | 'saved' | 'error'
            saveStatus: 'idle',
            saveStatusMessage: '',

            // Admin
            isAdmin: false,
            adminEmails: [],
            adminUsers: [],
            adminChangelog: [],
            newChangelogEntry: '',
            newAdminEmail: '',
            showChangelogBanner: false,
            latestChangelog: null,
            changelogDismissed: false,
        };
    },

    // ─────────────────────────────────────────────────────────────────────────
    // COMPUTED
    // ─────────────────────────────────────────────────────────────────────────
    computed: {
        ...contactsComputed,
        ...planningComputed,

        totalCA() {
            return this.db.events
                .filter(e => e.status === 'conf')
                .reduce((sum, e) => sum + (Number(e.fee) || 0), 0);
        },

        omniResults() {
            if (this.omniSearch.length < 2) return {};
            const s = this.omniSearch.toLowerCase();
            const res = {};
            const c = this.filteredContacts.filter(x => (x.name || '').toLowerCase().includes(s) || (x.structName && x.structName.toLowerCase().includes(s)));
            if (c.length) res['Contacts'] = c.map(x => ({ id: x.id, name: x.name || `${x.firstName||''} ${x.lastName||''}`.trim(), sub: x.structName, type: 'contact', original: x }));
            const st = this.db.structures.filter(x => x.name.toLowerCase().includes(s) || x.city.toLowerCase().includes(s));
            if (st.length) res['Lieux & Structures'] = st.map(x => ({ id: x.id, name: x.name, sub: x.city, type: 'structure', original: x }));
            const p = this.db.projects.filter(x => x.name.toLowerCase().includes(s));
            if (p.length) res['Spectacles'] = p.map(x => ({ id: x.id, name: x.name, sub: x.genre, type: 'project', original: x }));
            return res;
        },

        // ── Tags dynamiques : liste statique + tous les tags réellement en base ──
        allTagCategories() {
            const set = new Set(this.tagCategories);
            this.db.structures.forEach(s => (s.tags?.categories || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagGenres() {
            const set = new Set(this.tagGenres);
            this.db.structures.forEach(s => (s.tags?.genres || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagReseaux() {
            const set = new Set(this.tagReseaux);
            this.db.structures.forEach(s => (s.tags?.reseaux || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagKeywords() {
            const set = new Set(this.tagKeywords);
            this.db.structures.forEach(s => (s.tags?.keywords || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },

        hasActiveGeoTagFilters() {
            return Object.values(this.geoTagFilter || {}).some(arr => arr && arr.length > 0);
        },

        adminStats() {
            // Protection si les données ne sont pas encore chargées
            if (!this.db || !this.db.structures) {
                return { totalContacts: 0, privateContacts: 0, structsWithGps: 0, gpsRate: 0, emailRate: 0, tagRate: 0, recentActivity: [], alerts: [] };
            }
            const allContacts = this.db.structures.flatMap(s => s.contacts || []);
            const totalContacts   = allContacts.length;
            const privateContacts = allContacts.filter(c => c.isPrivate).length;
            const structsWithGps  = this.db.structures.filter(s => s.lat && s.lng).length;
            const structsTotal    = this.db.structures.length || 1;
            const gpsRate         = Math.round((structsWithGps / structsTotal) * 100);
            const contactsWithEmail = allContacts.filter(c => c.emailPro || c.emailPerso).length;
            const emailRate       = totalContacts > 0 ? Math.round((contactsWithEmail / totalContacts) * 100) : 0;
            const structsWithTags = this.db.structures.filter(s => {
                const t = s.tags || {};
                return (t.categories||[]).length > 0 || (t.genres||[]).length > 0 || (t.reseaux||[]).length > 0 || (t.keywords||[]).length > 0;
            }).length;
            const tagRate = Math.round((structsWithTags / structsTotal) * 100);

            // Activité récente : derniers commentaires + dernières structures créées
            const recentActivity = [];
            this.db.structures.forEach(s => {
                // Commentaires structure
                (s.comments || []).forEach(cm => {
                    recentActivity.push({ id: 'sc_' + cm.id, type: 'comment', label: `Commentaire sur "${s.name}" : ${cm.text.substring(0,50)}${cm.text.length>50?'…':''}`, date: cm.date, user: cm.user });
                });
                // Commentaires contacts
                (s.contacts || []).forEach(c => {
                    (c.comments || []).forEach(cm => {
                        recentActivity.push({ id: 'cc_' + cm.id, type: 'contact', label: `Note sur ${c.firstName} ${c.lastName} (${s.name}) : ${cm.text.substring(0,40)}${cm.text.length>40?'…':''}`, date: cm.date, user: cm.user });
                    });
                });
                // Structure créée
                if (s.createdDate) {
                    recentActivity.push({ id: 'st_' + s.id, type: 'structure', label: `Structure créée : "${s.name}" — ${s.city || ''}`, date: new Date(s.createdDate).toLocaleDateString('fr-FR'), user: '' });
                }
            });
            recentActivity.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            // Alertes qualité
            const alerts = [];
            const noEmail = allContacts.filter(c => !c.emailPro && !c.emailPerso).length;
            if (noEmail > 0) alerts.push({ id: 'a1', level: 'warn', message: 'Contacts sans email', detail: 'Ces contacts ne pourront pas recevoir de campagne mailing.', count: noEmail });
            const noGps = this.db.structures.filter(s => !s.lat || !s.lng).length;
            if (noGps > 0) alerts.push({ id: 'a2', level: 'warn', message: 'Structures sans GPS', detail: 'Non visibles sur la carte & invitations.', count: noGps });
            const noContact = this.db.structures.filter(s => !(s.contacts||[]).length).length;
            if (noContact > 0) alerts.push({ id: 'a3', level: 'warn', message: 'Structures sans contact', detail: 'Aucun interlocuteur renseigné pour ces structures.', count: noContact });
            const noPhone = allContacts.filter(c => !c.phoneDirect && !c.mobilePro && !c.phonePerso && !c.mobilePerso).length;
            if (noPhone > 0) alerts.push({ id: 'a4', level: 'warn', message: 'Contacts sans téléphone', detail: 'Aucun numéro renseigné.', count: noPhone });
            const noCity = this.db.structures.filter(s => !s.city).length;
            if (noCity > 0) alerts.push({ id: 'a5', level: 'error', message: 'Structures sans ville', detail: 'La ville est indispensable pour les recherches géographiques.', count: noCity });
            const noTags = this.db.structures.filter(s => { const t = s.tags||{}; return !(t.categories||[]).length && !(t.genres||[]).length && !(t.reseaux||[]).length && !(t.keywords||[]).length; }).length;
            if (noTags > 0) alerts.push({ id: 'a6', level: 'warn', message: 'Structures sans tags', detail: 'Non filtrables dans Mailing et Carte & Invitations.', count: noTags });

            return { totalContacts, privateContacts, structsWithGps, gpsRate, emailRate, tagRate, recentActivity: recentActivity.slice(0, 20), alerts };
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // WATCHERS
    // ─────────────────────────────────────────────────────────────────────────
    watch: {
        tab(newVal) {
            if (newVal === 'geo') { nextTick(() => { setTimeout(() => { this.initMap(); }, 300); }); }
        },
        searchRadius() {
            if (this.tab === 'geo') this.updateMap();
        },
        'db.structures': {
            deep: true,
            handler() { if (this.tab === 'geo') this.updateMap(); }
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // METHODS
    // Les méthodes des modules sont spreadées en premier.
    // Les méthodes inline ci-dessous les surchargent si nécessaire.
    // ─────────────────────────────────────────────────────────────────────────
    methods: {
        ...utilsMethods,
        ...contactsMethods,
        ...planningMethods,

        // --- AUTHENTIFICATION FIREBASE ---
        async handleAuth() {
            try {
                if (this.isLoginMode) {
                    await signInWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Succès', 'Ravi de vous revoir !', 'success');
                } else {
                    await createUserWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Bienvenue', 'Votre compte a été créé avec succès.', 'success');
                }
                this.authEmail = '';
                this.authPassword = '';
            } catch (error) {
                console.error(error);
                Swal.fire('Erreur', 'Email ou mot de passe incorrect (ou compte déjà existant).', 'error');
            }
        },

        async logout() {
            await signOut(auth);
            this.currentUser = null;
        },

        // --- PERSISTANCE FIRESTORE ---
        async saveDB() {
            if (!this.currentUser) return;
            this.saveStatus = 'saving';
            this.saveStatusMessage = 'Synchronisation…';
            try {
                // 1. Sauvegarde des données propres à l'utilisateur
                // AJOUT DE .uid ICI
                await setDoc(doc(dbFirestore, "users", this.currentUser), {
                    projects:        this.db.projects,
                    tasks:           this.db.tasks,
                    events:          this.db.events,
                    templates:       this.db.templates       || [],
                    campaignHistory: this.db.campaignHistory || [],
                });

                // 2. Sauvegarde des tags et de l'annuaire (Partagé)
                await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                    structures:    this.db.structures,
                    // Utilisation de this.db.tag... pour être raccord avec le reste
                    tagCategories: this.db.tagCategories,
                    tagGenres:     this.db.tagGenres,
                    tagReseaux:    this.db.tagReseaux,
                    tagKeywords:   this.db.tagKeywords,
                });

                this.saveStatus = 'saved';
                this.saveStatusMessage = 'Synchronisé · ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setTimeout(() => { if (this.saveStatus === 'saved') this.saveStatus = 'idle'; }, 4000);
            } catch (error) {
                // ... reste de votre gestion d'erreur
                console.error("Erreur sauvegarde cloud :", error);
                this.saveStatus = 'error';
                this.saveStatusMessage = 'Erreur de sauvegarde !';
                Swal.fire({
                    title: 'Erreur Firebase',
                    html: 'Les données n\'ont pas pu être sauvegardées.<br><small>' + error.message + '</small>',
                    icon: 'error',
                    confirmButtonText: 'Réessayer',
                    showCancelButton: true,
                    cancelButtonText: 'Ignorer'
                }).then(r => { if (r.isConfirmed) this.saveDB(); });
            }
        },
        async refreshTags() {
    this.saveStatus = 'saving';
    this.saveStatusMessage = 'Actualisation des tags...';
    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const docRef = doc(dbFirestore, "shared", "annuaire");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const d = docSnap.data();
            this.db.tagCategories = d.tagCategories || this.db.tagCategories;
            this.db.tagGenres     = d.tagGenres     || this.db.tagGenres;
            this.db.tagReseaux    = d.tagReseaux    || this.db.tagReseaux;
            this.db.tagKeywords   = d.tagKeywords   || this.db.tagKeywords;
            
            this.saveStatus = 'saved';
            Swal.fire({ title: 'Tags actualisés', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        }
    } catch (error) {
        console.error("Erreur refresh tags:", error);
        this.saveStatus = 'error';
    }
},
        async saveData() {
            await this.saveDB();
            if (this.saveStatus === 'saved') {
                Swal.fire({ title: 'Enregistré sur Firebase ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
            }
        },

       // --- TAGS & PARAMÈTRES ---
async addGlobalTag(familyName) {
    const r = await Swal.fire({
        title: 'Nouveau tag', 
        input: 'text', 
        inputPlaceholder: 'Entrez le nom du tag...',
        showCancelButton: true, 
        confirmButtonText: 'Ajouter', 
        cancelButtonText: 'Annuler'
    });
    
    
    if (r.isConfirmed && r.value.trim()) {
        // CORRECTION : On modifie dans this.db[familyName]
        if (!this.db[familyName]) this.db[familyName] = [];
        
        // On crée une nouvelle copie du tableau dans db pour la réactivité
        this.db[familyName] = [...this.db[familyName], r.value.trim()];
        
        // Sauvegarde de l'objet db (qui contient maintenant le nouveau tag)
        await this.saveDB();
        
        Swal.fire({ 
            title: 'Tag sauvegardé ✓', 
            icon: 'success', 
            toast: true, 
            position: 'top-end', 
            timer: 1500, 
            showConfirmButton: false 
        });
    }
},

async removeGlobalTag(familyName, tag) {
    const r = await Swal.fire({
        title: 'Supprimer ce tag ?', 
        text: `Le tag "${tag}" ne sera plus proposé.`,
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#ef4444', 
        confirmButtonText: 'Supprimer'
    });
    
    if (r.isConfirmed) {
        // CORRECTION : On filtre dans this.db[familyName]
        if (this.db[familyName]) {
            this.db[familyName] = this.db[familyName].filter(t => t !== tag);
            await this.saveDB();
        }
    }
},

        // --- MOTEUR CRM ---
        openCrmView(struct = null) {
            if (!struct) {
                struct = {
                    id: Date.now().toString(), name: 'Nouvelle Structure', isClient: false, isActive: true,
                    clientCode: '', source: '', createdDate: new Date().toISOString(),
                    address: '', suite: '', zip: '', city: '', country: 'France',
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
            nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
        },

        closeCrmContact() {
            this.currentCrmContact = null;
            nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
        },

        saveCrmStruct(silent = false) {
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
            this.currentCrmStruct.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.newCrmComment.trim(), user: this.currentUserName });
            this.newCrmComment = '';
            // Sauvegarde automatique immédiate
            this.saveDB();
        },

        addContactComment() {
            if (!this.newContactComment.trim()) return;
            if (!this.currentCrmContact.comments) this.currentCrmContact.comments = [];
            this.currentCrmContact.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.newContactComment.trim(), user: this.currentUserName });
            this.newContactComment = '';
            // Sauvegarde automatique immédiate
            this.saveDB();
        },

        // --- ADMIN ---
        async refreshAdminStats() {
            await this.loadAdminUsers();
            Swal.fire({ title: 'Données actualisées ✓', icon: 'success', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        },

        async loadAdminUsers() {
            try {
                const snapshot = await getDocs(collection(dbFirestore, "users_registry"));
                this.adminUsers = snapshot.docs.map(d => d.data()).sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''));
            } catch (e) {
                console.error("Erreur chargement utilisateurs:", e);
            }
        },

        // --- GESTION BASE DE DONNÉES (ADMIN) ---
        async exportFullDB() {
            try {
                Swal.fire({ title: 'Préparation...', text: 'Chargement de toutes les données...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                // Récupérer les données partagées depuis Firestore
                const annuaireSnap = await getDoc(doc(dbFirestore, "shared", "annuaire"));
                const configSnap   = await getDoc(doc(dbFirestore, "shared", "config"));

                const backup = {
                    exportDate:      new Date().toISOString(),
                    exportBy:        this.currentUserName,
                    version:         '1.0',
                    // Données utilisateur
                    projects:        this.db.projects,
                    tasks:           this.db.tasks,
                    events:          this.db.events,
                    templates:       this.db.templates,
                    campaignHistory: this.db.campaignHistory,
                    // Données partagées
                    structures:      annuaireSnap.exists() ? (annuaireSnap.data().structures || [])    : this.db.structures,
                    tagCategories:   annuaireSnap.exists() ? (annuaireSnap.data().tagCategories || []) : this.db.tagCategories,
                    tagGenres:       annuaireSnap.exists() ? (annuaireSnap.data().tagGenres || [])     : this.db.tagGenres,
                    tagReseaux:      annuaireSnap.exists() ? (annuaireSnap.data().tagReseaux || [])    : this.db.tagReseaux,
                    tagKeywords:     annuaireSnap.exists() ? (annuaireSnap.data().tagKeywords || [])   : this.db.tagKeywords,
                    // Config admin
                    adminConfig:     configSnap.exists() ? configSnap.data() : {},
                };

                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
                a.href     = url;
                a.download = `BobBooking_backup_${date}.json`;
                a.click();
                URL.revokeObjectURL(url);

                Swal.fire({ title: 'Sauvegarde téléchargée ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            } catch (e) {
                console.error("Erreur export:", e);
                Swal.fire('Erreur', 'Impossible de générer la sauvegarde : ' + e.message, 'error');
            }
        },

        async importFullDB(event) {
            const file = event.target.files[0];
            if (!file) return;
            event.target.value = '';

            const r = await Swal.fire({
                title: '⚠️ Restaurer la base ?',
                html: `Le fichier <b>${file.name}</b> va remplacer <b>toutes les données actuelles</b>.<br><br>Cette action est irréversible. Êtes-vous sûr ?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3b82f6',
                confirmButtonText: 'Oui, restaurer',
                cancelButtonText: 'Annuler'
            });
            if (!r.isConfirmed) return;

            try {
                Swal.fire({ title: 'Restauration...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const text    = await file.text();
                const backup  = JSON.parse(text);

                // Restaurer données utilisateur
                this.db.projects        = backup.projects        || [];
                this.db.tasks           = backup.tasks           || [];
                this.db.events          = backup.events          || [];
                this.db.templates       = backup.templates       || [];
                this.db.campaignHistory = backup.campaignHistory || [];

                // Restaurer données partagées
                this.db.structures    = backup.structures    || [];
                this.db.tagCategories = backup.tagCategories || [];
                this.db.tagGenres     = backup.tagGenres     || [];
                this.db.tagReseaux    = backup.tagReseaux    || [];
                this.db.tagKeywords   = backup.tagKeywords   || [];

                await this.saveDB();

                Swal.fire({
                    title: 'Restauration réussie ✓',
                    html: `Base restaurée depuis <b>${file.name}</b><br><small class="text-slate-500">Exporté le ${backup.exportDate ? new Date(backup.exportDate).toLocaleDateString('fr-FR') : '?'} par ${backup.exportBy || '?'}</small>`,
                    icon: 'success',
                    confirmButtonColor: '#3b82f6'
                });
            } catch (e) {
                console.error("Erreur import:", e);
                Swal.fire('Erreur', 'Fichier invalide ou corrompu : ' + e.message, 'error');
            }
        },

        async clearAnnuaire() {
            const r = await Swal.fire({
                title: '⚠️ Vider l\'annuaire partagé ?',
                html: 'Cela supprimera <b>toutes les structures, tous les contacts et tous les tags</b> de manière définitive.<br><br>Les événements, projets et tâches seront conservés.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#f97316',
                confirmButtonText: 'Oui, vider l\'annuaire',
                cancelButtonText: 'Annuler',
                input: 'text',
                inputPlaceholder: 'Tapez CONFIRMER pour valider',
                inputValidator: (v) => v !== 'CONFIRMER' ? 'Vous devez taper exactement CONFIRMER' : null
            });
            if (!r.isConfirmed) return;

            try {
                this.db.structures    = [];
                this.db.tagCategories = [];
                this.db.tagGenres     = [];
                this.db.tagReseaux    = [];
                this.db.tagKeywords   = [];
                await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                    structures: [], tagCategories: [], tagGenres: [], tagReseaux: [], tagKeywords: []
                });
                Swal.fire({ title: 'Annuaire vidé ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            } catch (e) {
                Swal.fire('Erreur', 'Vidage impossible : ' + e.message, 'error');
            }
        },

        async clearAllData() {
            const r = await Swal.fire({
                title: '🚨 Tout réinitialiser ?',
                html: '<b>TOUTES les données seront supprimées</b> de manière définitive :<br>structures, contacts, événements, projets, tâches, tags, templates, historique...<br><br>La configuration admin sera conservée.',
                icon: 'error',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'Oui, tout supprimer',
                cancelButtonText: 'Annuler',
                input: 'text',
                inputPlaceholder: 'Tapez TOUT SUPPRIMER pour valider',
                inputValidator: (v) => v !== 'TOUT SUPPRIMER' ? 'Vous devez taper exactement TOUT SUPPRIMER' : null
            });
            if (!r.isConfirmed) return;

            try {
                Swal.fire({ title: 'Réinitialisation...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                // Vider local
                this.db.projects        = [];
                this.db.tasks           = [];
                this.db.events          = [];
                this.db.templates       = [];
                this.db.campaignHistory = [];
                this.db.structures      = [];
                this.db.tagCategories   = [];
                this.db.tagGenres       = [];
                this.db.tagReseaux      = [];
                this.db.tagKeywords     = [];

                // Vider Firebase
                await setDoc(doc(dbFirestore, "users", this.currentUser), {
                    projects: [], tasks: [], events: [], templates: [], campaignHistory: []
                });
                await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                    structures: [], tagCategories: [], tagGenres: [], tagReseaux: [], tagKeywords: []
                });

                Swal.fire({ title: 'Base réinitialisée ✓', text: 'Toutes les données ont été supprimées.', icon: 'success', confirmButtonColor: '#dc2626' });
            } catch (e) {
                Swal.fire('Erreur', 'Réinitialisation impossible : ' + e.message, 'error');
            }
        },

        async activateSelfAsAdmin() {
            const email = auth.currentUser?.email;
            if (!email) return Swal.fire('Erreur', 'Impossible de récupérer votre email.', 'error');
            const r = await Swal.fire({
                title: 'Activer les droits Admin ?',
                html: `Votre compte <b>${email}</b> sera enregistré comme administrateur dans Firebase.`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#f59e0b',
                confirmButtonText: 'Oui, m\'activer',
                cancelButtonText: 'Annuler'
            });
            if (!r.isConfirmed) return;
            if (!this.adminEmails.includes(email)) this.adminEmails.push(email);
            await this.saveAdminConfig();
            this.isAdmin = true;
            Swal.fire({ title: '✅ Admin activé !', text: "L'onglet Administration est maintenant disponible dans le menu.", icon: 'success', confirmButtonColor: '#f59e0b' });
        },

        async addChangelogEntry() {
            if (!this.newChangelogEntry.trim()) return;
            const entry = {
                id: Date.now().toString(),
                text: this.newChangelogEntry.trim(),
                date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
                author: this.currentUserName
            };
            this.adminChangelog.unshift(entry);
            this.newChangelogEntry = '';
            await this.saveAdminConfig();
            Swal.fire({ title: 'Note publiée ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        },

        async deleteChangelogEntry(id) {
            this.adminChangelog = this.adminChangelog.filter(e => e.id !== id);
            await this.saveAdminConfig();
        },

        async addAdminEmail() {
            const email = (this.newAdminEmail || '').trim().toLowerCase();
            if (!email || !email.includes('@')) return Swal.fire('Erreur', 'Email invalide.', 'warning');
            if (this.adminEmails.includes(email)) return Swal.fire('Info', 'Cet email est déjà admin.', 'info');
            this.adminEmails.push(email);
            this.newAdminEmail = '';
            await this.saveAdminConfig();
            Swal.fire({ title: 'Admin ajouté ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        },

        async removeAdminEmail(email) {
            if (email === this.currentUserName || email === auth.currentUser?.email) {
                return Swal.fire('Attention', 'Vous ne pouvez pas vous retirer vous-même.', 'warning');
            }
            const r = await Swal.fire({ title: 'Retirer cet admin ?', text: email, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
            if (r.isConfirmed) {
                this.adminEmails = this.adminEmails.filter(e => e !== email);
                await this.saveAdminConfig();
            }
        },

        async saveAdminConfig() {
            try {
                await setDoc(doc(dbFirestore, "shared", "config"), {
                    adminEmails: this.adminEmails,
                    changelog:   this.adminChangelog,
                });
            } catch (e) {
                console.error("Erreur sauvegarde config admin:", e);
                Swal.fire('Erreur', 'Impossible de sauvegarder la configuration.', 'error');
            }
        },

        // --- FILTRES TAGS CARTE GEO ---
        toggleGeoTagFilter(family, tag) {
            if (!this.geoTagFilter[family]) this.geoTagFilter[family] = [];
            const idx = this.geoTagFilter[family].indexOf(tag);
            if (idx > -1) this.geoTagFilter[family].splice(idx, 1);
            else this.geoTagFilter[family].push(tag);
            this.updateMap();
        },
        isGeoTagActive(family, tag) {
            return (this.geoTagFilter[family] || []).includes(tag);
        },
        clearGeoTagFilters() {
            this.geoTagFilter = {};
            this.updateMap();
        },

        openCrmContact(c = null) {
            if (!c) c = { id: Date.now().toString(), firstName: '', lastName: '', role: '', isVip: false, isActive: true, suiviPar: this.currentUser, isPrivate: false, emailPro: '', emailPerso: '', phoneDirect: '', phonePerso: '', mobilePro: '', mobilePerso: '', mobile2: '', tchat: '', tchatCode: '', website: '', address: '', suiteAddress: '', zip: '', city: '', country: '', createdDate: new Date().toISOString(), modifiedDate: '', notes: '', comments: [] };
            this.currentCrmContact = JSON.parse(JSON.stringify(c));
        },

        saveCrmContact() {
            if (!this.currentCrmContact.lastName && !this.currentCrmContact.firstName)
                return Swal.fire('Erreur', 'Renseignez un nom ou prénom.', 'warning');
            this.currentCrmContact.modifiedDate = new Date().toISOString();
            if (!this.currentCrmContact.createdDate) this.currentCrmContact.createdDate = new Date().toISOString();
            const idx = this.currentCrmStruct.contacts.findIndex(x => x.id === this.currentCrmContact.id);
            if (idx > -1) this.currentCrmStruct.contacts[idx] = this.currentCrmContact;
            else          this.currentCrmStruct.contacts.push(this.currentCrmContact);
            this.currentCrmStruct.contacts.forEach(cnt => cnt.name = `${cnt.firstName || ''} ${cnt.lastName || ''}`.trim());
            this.currentCrmContact = null;
        },

        deleteCrmContact(id) {
            this.currentCrmStruct.contacts = this.currentCrmStruct.contacts.filter(c => c.id !== id);
            this.currentCrmContact = null;
        },

        goToTasksFromCrm() {
            if (!this.currentCrmStruct.name.trim()) return Swal.fire('Attention', "Sauvegardez d'abord la structure", 'warning');
            this.saveCrmStruct(true);
            this.tab = 'tasks';
            setTimeout(() => this.openTaskModal(null, { relType: 'structure', relId: this.currentCrmStruct.id }), 300);
        },

        goToAnnuaireFromCrm() {
            this.saveCrmStruct(true);
            this.tab = 'contacts';
        },

        openRelated(t) {
            if (t.relType === 'structure') { const s = this.db.structures.find(x => x.id === t.relId); if (s) { this.tab = 'structures'; this.openCrmView(s); } }
            else if (t.relType === 'contact') { const s = this.db.structures.find(st => st.contacts && st.contacts.some(c => c.id === t.relId)); if (s) { this.tab = 'structures'; this.openCrmView(s); } }
            else if (t.relType === 'event')   { const e = this.db.events.find(x => x.id === t.relId); if (e) { this.tab = 'planning'; this.openEventModal(null, e); } }
            else if (t.relType === 'project') { const p = this.db.projects.find(x => x.id === t.relId); if (p) { this.tab = 'projects'; this.openProjectModal(p); } }
        },

        // --- CARTOGRAPHIE CRM (mini-carte) ---
        initMiniMap() {
            const mapEl = document.getElementById('mini-map');
            if (!mapEl) return;
            if (window.myCrmMap) { window.myCrmMap.off(); window.myCrmMap.remove(); }
            const lat  = this.currentCrmStruct.lat || 46.603354;
            const lng  = this.currentCrmStruct.lng || 1.888334;
            const zoom = this.currentCrmStruct.lat ? 14 : 5;
            window.myCrmMap = L.map('mini-map').setView([lat, lng], zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myCrmMap);
            let marker = null;
            if (this.currentCrmStruct.lat) marker = L.marker([lat, lng]).addTo(window.myCrmMap);
            window.myCrmMap.on('click', e => {
                this.currentCrmStruct.lat = e.latlng.lat;
                this.currentCrmStruct.lng = e.latlng.lng;
                if (marker) window.myCrmMap.removeLayer(marker);
                marker = L.marker(e.latlng).addTo(window.myCrmMap);
            });
            setTimeout(() => { window.myCrmMap.invalidateSize(); }, 500);
        },

        async geocodeAddress() {
            const s = this.currentCrmStruct;
            const query = `${s.address || ''} ${s.zip || ''} ${s.city || ''} ${s.country || 'France'}`.trim();
            if (query.length < 5) return Swal.fire('Erreur', 'Renseignez au moins une ville ou un code postal.', 'warning');
            try {
                Swal.fire({ title: 'Recherche satellite...', text: query, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const data = await response.json();
                if (data && data.length > 0) {
                    this.currentCrmStruct.lat = parseFloat(data[0].lat);
                    this.currentCrmStruct.lng = parseFloat(data[0].lon);
                    Swal.fire({ title: 'Cible verrouillée !', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                    this.initMiniMap();
                } else {
                    Swal.fire('Non trouvé', "Adresse introuvable. Cliquez sur la carte pour placer le point.", 'warning');
                }
            } catch (err) {
                Swal.fire('Erreur', 'Problème de connexion GPS.', 'error');
            }
        },

        // --- CARTOGRAPHIE GRANDE CARTE ---
        initMap() {
            const mapEl = document.getElementById('map') || document.getElementById('main-map');
            if (!mapEl) return;
            if (window.myGlobalMap) { window.myGlobalMap.off(); window.myGlobalMap.remove(); }
            window.myGlobalMap = L.map(mapEl).setView([46.603354, 1.888334], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myGlobalMap);
            window.myGlobalMap.on('click', (e) => {
                this.searchCenter = e.latlng;
                this.updateMap();
            });
            this.updateMap();
        },

        updateMap() {
            if (!window.myGlobalMap) return;
            if (this.mapMarkers) this.mapMarkers.forEach(m => window.myGlobalMap.removeLayer(m));
            if (this.searchCircle) window.myGlobalMap.removeLayer(this.searchCircle);
            this.mapMarkers = [];
            this.selectedMailingContacts = [];

            if (this.searchCenter) {
                this.searchCircle = L.circle(this.searchCenter, {
                    color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.15,
                    radius: this.searchRadius * 1000
                }).addTo(window.myGlobalMap);
            }

            // Filtrage par tags actifs
            const activeGeoTags = this.geoTagFilter || {};
            const hasGeoTagFilter = Object.values(activeGeoTags).some(arr => arr && arr.length > 0);
            const matchesGeoTags = (s) => {
                if (!hasGeoTagFilter) return true;
                return Object.entries(activeGeoTags).every(([family, tags]) => {
                    if (!tags || tags.length === 0) return true;
                    const structTags = (s.tags && s.tags[family]) || [];
                    return tags.some(t => structTags.includes(t));
                });
            };

            // Structures affichées sur la carte : uniquement celles avec GPS
            const geoStructures = this.db.structures.filter(s => {
                if (!s.lat || !s.lng) return false;
                if (!matchesGeoTags(s)) return false;
                if (!this.searchCenter) return true;
                return this.getDist(this.searchCenter.lat, this.searchCenter.lng, s.lat, s.lng) <= this.searchRadius;
            });
            this.geoResults = geoStructures;

            // Marqueurs sur la carte
            geoStructures.forEach(s => {
                const marker = L.marker([s.lat, s.lng]).addTo(window.myGlobalMap);
                marker.bindPopup(`<b>${s.name}</b><br>${s.city || ''}`);
                marker.on('click', () => { this.openCrmView(s); });
                this.mapMarkers.push(marker);
            });

            // Liste de contacts dans le panneau latéral
            const contactSources = this.searchCenter
                ? geoStructures
                : this.db.structures.filter(s => matchesGeoTags(s));

            contactSources.forEach(s => {
                const structInfo = {
                    structName: s.name, structCity: s.city,
                    structZip: s.zip, structAddress: s.address,
                    structPhone: s.phone1 || s.phone
                };
                if (s.contacts && s.contacts.length > 0) {
                    s.contacts.forEach(c => {
                        this.selectedMailingContacts.push({ ...c, ...structInfo });
                    });
                } else {
                    this.selectedMailingContacts.push({
                        firstName: '', lastName: 'Contact Lieu', role: '',
                        emailPro: s.email || '', ...structInfo
                    });
                }
            });
        },

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
                .then(r => { if (r.isConfirmed) { const ps = this.db.structures.find(s => s.id === c.structId); if (ps) { ps.contacts = ps.contacts.filter(x => x.id !== c.id); this.saveDB(); } } });
        },

        addGlobalContact() {
            Swal.fire({ icon: 'info', title: 'Nouveau système CRM', text: 'Pour ajouter un contact, ouvrez la fiche CRM de la structure à laquelle il appartient !', confirmButtonColor: '#4f46e5' });
        },

        // --- IMPORT EXCEL ---
        // Gère 2 formats :
        //   • Format natif CRM (ex: export Billom) : 2 lignes d'en-tête, jusqu'à 3 contacts par ligne
        //   • Format export appli (flat, 1 contact par ligne)
        importContactsExcel(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data      = new Uint8Array(e.target.result);
                    const workbook  = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    // Lecture brute (tableau de tableaux)
                    const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                    if (raw.length < 2) return Swal.fire('Info', 'Fichier vide.', 'info');

                    const isNativeFormat = (raw[0][0] === 'Structure');
                    let countContacts = 0, countStructs = 0;

                    // ── Helpers ──────────────────────────────────────────────
                    const str  = v => (v === null || v === undefined || v === '') ? '' : String(v).trim();
                    const bool = v => str(v) === '1' || str(v).toLowerCase() === 'oui' || str(v).toLowerCase() === 'true';

                    const findOrCreateStruct = (name, city) => {
                        if (!name) return null;
                        let s = this.db.structures.find(x =>
                            x.name.toLowerCase() === name.toLowerCase() &&
                            (x.city || '').toLowerCase() === city.toLowerCase()
                        );
                        if (!s) {
                            s = {
                                id: Date.now() + Math.random(),
                                name, city,
                                clientCode: '', source: '', createdDate: new Date().toISOString(),
                                address: '', suite: '', zip: '', country: 'France',
                                phone1: '', phone2: '', mobile: '', fax: '', email: '', website: '',
                                capacity: '', season: '', hours: '', lat: null, lng: null,
                                isClient: false, isActive: true,
                                contacts: [], comments: [], venues: [],
                                tags: { categories: [], genres: [], reseaux: [], keywords: [] }
                            };
                            this.db.structures.push(s);
                            countStructs++;
                        }
                        return s;
                    };

                    const buildContact = (cols, base, hasVisibility) => {
                        const firstName = str(cols[base]);
                        const lastName  = str(cols[base + 1]);
                        if (!firstName && !lastName) return null;
                        return {
                            id:           Date.now() + Math.random(),
                            firstName,
                            lastName,
                            name:         [firstName, lastName].filter(Boolean).join(' '),
                            address:      str(cols[base + 2]),
                            suiteAddress: str(cols[base + 3]),
                            zip:          str(cols[base + 4]),
                            city:         str(cols[base + 5]),
                            country:      str(cols[base + 6]),
                            phonePerso:   str(cols[base + 7]),
                            phoneDirect:  str(cols[base + 8]),
                            mobilePro:    str(cols[base + 9]),
                            mobilePerso:  str(cols[base + 10]),
                            mobile2:      str(cols[base + 11]),
                            emailPro:     str(cols[base + 12]),
                            emailPerso:   str(cols[base + 13]),
                            isVip:        bool(cols[base + 14]),
                            tchat:        str(cols[base + 15]),
                            tchatCode:    str(cols[base + 16]),
                            website:      str(cols[base + 17]),
                            role:         str(cols[base + 18]),
                            createdDate:  str(cols[base + 19]) || new Date().toISOString(),
                            modifiedDate: str(cols[base + 20]),
                            isActive:     str(cols[base + 21]) !== '0' && str(cols[base + 21]).toLowerCase() !== 'false',
                            suiviPar:     str(cols[base + 22]) || this.currentUser,
                            // Colonne Visibilité (nouveau format) : base+23
                            isPrivate:    hasVisibility
                                            ? str(cols[base + 23]).toLowerCase() === 'privé' || str(cols[base + 23]).toLowerCase() === 'prive'
                                            : false,
                            owner:        this.currentUser,
                            notes:        '',
                            comments:     []
                        };
                    };

                    const splitTags = v => str(v) ? str(v).split(';').map(x => x.trim()).filter(Boolean) : [];

                    // ── Format natif (2 lignes d'en-tête) ───────────────────
                    if (isNativeFormat) {
                        const dataRows = raw.slice(2); // skip row0 (sections) + row1 (champs)

                        // Détection format : nouveau (24 champs/contact avec Visibilité) ou ancien (23 champs)
                        // Dans le nouveau format, la col index 40 (row1) est "Visibilité"
                        const headerRow    = raw[1] || [];
                        const hasVisibility = str(headerRow[40]).toLowerCase() === 'visibilité' || str(headerRow[40]).toLowerCase() === 'visibilite';
                        // Bases de contact et positions tags selon le format
                        const contactBases = hasVisibility ? [17, 41, 65] : [17, 40, 63];
                        const tagBase      = hasVisibility ? 89 : 86;

                        dataRows.forEach(cols => {
                            if (!str(cols[0])) return; // ligne vide
                            const struct = findOrCreateStruct(str(cols[0]), str(cols[5]));
                            if (!struct) return;

                            // Champs structure
                            if (!struct.clientCode && str(cols[1]))  struct.clientCode = str(cols[1]);
                            if (!struct.address    && str(cols[2]))  struct.address    = str(cols[2]);
                            if (!struct.suite      && str(cols[3]))  struct.suite      = str(cols[3]);
                            if (!struct.zip        && str(cols[4]))  struct.zip        = str(cols[4]);
                            if (!struct.country    && str(cols[6]))  struct.country    = str(cols[6]);
                            if (!struct.phone1     && str(cols[7]))  struct.phone1     = str(cols[7]);
                            if (!struct.phone2     && str(cols[8]))  struct.phone2     = str(cols[8]);
                            if (!struct.email      && str(cols[9]))  struct.email      = str(cols[9]);
                            if (!struct.mobile     && str(cols[10])) struct.mobile     = str(cols[10]);
                            if (!struct.fax        && str(cols[11])) struct.fax        = str(cols[11]);
                            if (!struct.website    && str(cols[12])) struct.website    = str(cols[12]);
                            struct.isClient = bool(cols[13]);
                            struct.isActive = str(cols[14]) !== '0';
                            if (!struct.source      && str(cols[15])) struct.source      = str(cols[15]);
                            if (!struct.createdDate && str(cols[16])) struct.createdDate = str(cols[16]);

                            // Tags
                            if (!struct.tags) struct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
                            const cats   = splitTags(cols[tagBase]);
                            const genres = splitTags(cols[tagBase + 1]);
                            const res    = splitTags(cols[tagBase + 2]);
                            const kws    = splitTags(cols[tagBase + 3]);
                            cats.forEach(t => { if (!struct.tags.categories.includes(t)) struct.tags.categories.push(t); });
                            genres.forEach(t => { if (!struct.tags.genres.includes(t)) struct.tags.genres.push(t); });
                            res.forEach(t => { if (!struct.tags.reseaux.includes(t)) struct.tags.reseaux.push(t); });
                            kws.forEach(t => { if (!struct.tags.keywords.includes(t)) struct.tags.keywords.push(t); });

                            // Contacts 1, 2, 3
                            contactBases.forEach(base => {
                                const c = buildContact(cols, base, hasVisibility);
                                if (!c) return;
                                const exists = struct.contacts.some(x =>
                                    x.firstName === c.firstName && x.lastName === c.lastName
                                );
                                if (!exists) { struct.contacts.push(c); countContacts++; }
                            });
                        });

                    // ── Format export appli (flat, 1 contact par ligne) ──────
                    } else {
                        const headers = raw[0];
                        const dataRows = raw.slice(1);
                        dataRows.forEach(cols => {
                            const row = {};
                            headers.forEach((h, i) => { row[h] = cols[i]; });
                            const structName = str(row["Structure - Nom"] || row["Nom"] || "Structure importée");
                            const cityName   = str(row["Structure - Ville"] || row["Ville"] || "");
                            const struct = findOrCreateStruct(structName, cityName);
                            if (!struct) return;
                            if (!struct.address  && str(row["Structure - Adresse"]))     struct.address  = str(row["Structure - Adresse"]);
                            if (!struct.zip      && str(row["Structure - Code Postal"])) struct.zip      = str(row["Structure - Code Postal"]);
                            if (!struct.phone1   && str(row["Structure - Tél 1"]))       struct.phone1   = str(row["Structure - Tél 1"]);
                            if (!struct.phone2   && str(row["Structure - Tél 2"]))       struct.phone2   = str(row["Structure - Tél 2"]);
                            if (!struct.mobile   && str(row["Structure - Mobile"]))      struct.mobile   = str(row["Structure - Mobile"]);
                            if (!struct.fax      && str(row["Structure - Fax"]))         struct.fax      = str(row["Structure - Fax"]);
                            if (!struct.website  && str(row["Structure - Site"]))        struct.website  = str(row["Structure - Site"]);
                            if (!struct.email    && str(row["Structure - E-mail"]))      struct.email    = str(row["Structure - E-mail"]);
                            if (!struct.capacity && str(row["Structure - Capacité"]))    struct.capacity = str(row["Structure - Capacité"]);

                            const firstName = str(row["Contact - Prénom"]);
                            const lastName  = str(row["Contact - Nom"]);
                            if (firstName || lastName) {
                                struct.contacts.push({
                                    id:           Date.now() + Math.random(),
                                    firstName,
                                    lastName,
                                    name:         [firstName, lastName].filter(Boolean).join(' '),
                                    role:         str(row["Contact - Fonction"]),
                                    emailPro:     str(row["Contact - E-mail direct"]),
                                    emailPerso:   str(row["Contact - Email perso"]),
                                    phoneDirect:  str(row["Contact - Tél. direct"]),
                                    phonePerso:   str(row["Contact - Tél. perso"]),
                                    mobilePro:    str(row["Contact - Mobile pro"]),
                                    mobilePerso:  str(row["Contact - Mobile"]),
                                    mobile2:      str(row["Contact - Mobile 2"]),
                                    tchat:        str(row["Contact - Tchat"]),
                                    tchatCode:    str(row["Contact - Code du tchat"]),
                                    website:      str(row["Contact - Site"]),
                                    address:      str(row["Contact - Adresse"]),
                                    suiteAddress: str(row["Contact - Suite adresse"]),
                                    zip:          str(row["Contact - CP"]),
                                    city:         str(row["Contact - Ville"]),
                                    country:      str(row["Contact - Pays"]),
                                    isVip:        bool(row["Contact - Est prioritaire"]),
                                    isActive:     str(row["Contact - Est actif"]) !== '0',
                                    suiviPar:     str(row["Contact - Suivi par"]) || this.currentUser,
                                    createdDate:  str(row["Contact - Créé le"])   || new Date().toISOString(),
                                    modifiedDate: str(row["Contact - Modifié le"]),
                                    isPrivate:    str(row["Contact - Statut"]) === 'Privé',
                                    owner:        this.currentUser,
                                    notes:        str(row["Contact - Notes"])
                                });
                                countContacts++;
                            }
                        });
                    }

                    this.saveDB();
                    event.target.value = '';
                    Swal.fire('Succès !',
                        `Importation terminée.<br><b>${countContacts}</b> contacts importés.<br><b>${countStructs}</b> nouvelles structures créées.`,
                        'success');
                } catch (err) {
                    console.error("Erreur import :", err);
                    Swal.fire('Erreur', 'Impossible de lire le fichier Excel.<br>' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        },

        // --- EXPORT EXCEL (format natif CRM : Structure + Contact 1/2/3 + Tags) ---
        exportContactsToExcel(contactsList) {
            if (!contactsList || contactsList.length === 0)
                return Swal.fire('Export', 'Aucun contact à exporter.', 'info');
            try {
                // Regroupe les contacts par structure
                const structMap = new Map();
                contactsList.forEach(c => {
                    const struct = this.db.structures.find(s => s.id === c.structId) || { id: c.structId };
                    if (!structMap.has(c.structId)) structMap.set(c.structId, { struct, contacts: [] });
                    structMap.get(c.structId).contacts.push(c);
                });
                this._exportNativeFormat(Array.from(structMap.values()), 'Export_Invitations');
            } catch (err) {
                console.error(err);
                Swal.fire('Erreur', 'Export impossible.', 'error');
            }
        },

        // ── Méthode partagée : génère le fichier Excel au format natif CRM ──────────
        // entries = [{ struct, contacts[] }]
        _exportNativeFormat(entries, filename) {
            const CONTACT_FIELDS = ['Prénom','Nom','Adresse','Suite adresse','CP','Ville','Pays',
                'Tél. perso','Tél. direct','Mobile pro','Mobile','Mobile 2',
                'E-mail direct','Email perso','Est prioritaire','Tchat','Code du tchat',
                'Site','Fonction','Créé le','Modifié le','Est actif','Suivi par','Visibilité'];

            // Ligne 0 : en-têtes de sections (24 champs par contact maintenant)
            const row0 = new Array(93).fill('');
            row0[0]  = 'Structure';
            row0[17] = 'Contact 1';
            row0[41] = 'Contact 2';
            row0[65] = 'Contact 3';
            row0[89] = 'Tags';

            // Ligne 1 : noms de champs
            const row1 = [
                'Nom','Code client','Adresse','Suite adresse','Code postal','Ville','Pays',
                'Tél 1','Tél 2','E-mail','Mobile','Fax','Site','Est client','Est actif','Source','Créé le',
                ...CONTACT_FIELDS, ...CONTACT_FIELDS, ...CONTACT_FIELDS,
                'categories','genres (programmation)','reseaux','mots-clef'
            ];

            const contactCols = c => [
                c.firstName    || '',
                c.lastName     || '',
                c.address      || '',
                c.suiteAddress || '',
                c.zip          || '',
                c.city         || '',
                c.country      || '',
                c.phonePerso   || '',
                c.phoneDirect  || '',
                c.mobilePro    || '',
                c.mobilePerso  || '',
                c.mobile2      || '',
                c.emailPro     || '',
                c.emailPerso   || '',
                c.isVip        ? '1' : '0',
                c.tchat        || '',
                c.tchatCode    || '',
                c.website      || '',
                c.role         || '',
                c.createdDate  ? new Date(c.createdDate).toLocaleDateString('fr-FR') : '',
                c.modifiedDate ? new Date(c.modifiedDate).toLocaleDateString('fr-FR') : '',
                c.isActive !== false ? '1' : '0',
                c.suiviPar     || '',
                c.isPrivate    ? 'Privé' : 'Public'
            ];
            const emptyContact = () => new Array(24).fill('');

            const dataRows = entries.map(({ struct: s, contacts }) => {
                const tags = s.tags || {};
                const row = [
                    s.name        || '',
                    s.clientCode  || '',
                    s.address     || '',
                    s.suite       || '',
                    s.zip         || '',
                    s.city        || '',
                    s.country     || '',
                    s.phone1      || '',
                    s.phone2      || '',
                    s.email       || '',
                    s.mobile      || '',
                    s.fax         || '',
                    s.website     || '',
                    s.isClient    ? '1' : '0',
                    s.isActive !== false ? '1' : '0',
                    s.source      || '',
                    s.createdDate ? new Date(s.createdDate).toLocaleDateString('fr-FR') : '',
                    ...(contacts[0] ? contactCols(contacts[0]) : emptyContact()),
                    ...(contacts[1] ? contactCols(contacts[1]) : emptyContact()),
                    ...(contacts[2] ? contactCols(contacts[2]) : emptyContact()),
                    (tags.categories || []).join(';'),
                    (tags.genres     || []).join(';'),
                    (tags.reseaux    || []).join(';'),
                    (tags.keywords   || []).join(';')
                ];
                return row;
            });

            const ws = XLSX.utils.aoa_to_sheet([row0, row1, ...dataRows]);

            // Largeurs colonnes
            const colWidths = [
                30,14,28,18,12,20,12,14,14,28,14,10,28,10,10,16,14, // Structure (17)
                14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 1 (24)
                14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 2 (24)
                14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 3 (24)
                30,35,20,20 // Tags (4)
            ];
            ws['!cols'] = colWidths.map(wch => ({ wch }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Structure & Contacts');
            this.xlsxDownload(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
        },


        openProjectModal(p = null) {
            if (p) {
                this.editProjectData = JSON.parse(JSON.stringify(p));
                this.isEditingProject = false;
            } else {
                this.editProjectData = {
                    id: '', name: '', genre: '', duration: '', defaultFee: 0, feeType: 'HT',
                    teamSize: 1, expenses: '', linkVideo: '', linkPress: '', linkTech: '', linkTree: '',
                    color: DEFAULT_COLORS[this.db.projects.length % DEFAULT_COLORS.length],
                    icon: 'fas fa-music'
                };
                this.isEditingProject = true;
            }
            this.showProjectModal = true;
        },

        // --- OMNIBOX ---
        goOmni(item) {
            this.showOmniDropdown = false;
            this.omniSearch = '';
            if (item.type === 'structure') { this.tab = 'structures'; this.openCrmView(item.original); }
            if (item.type === 'contact')   { const s = this.db.structures.find(st => st.id === item.original.structId); if (s) { this.tab = 'structures'; this.openCrmView(s); } }
            if (item.type === 'project')   { this.tab = 'projects'; this.openProjectModal(item.original); }
        },

        hideOmni() {
            setTimeout(() => { this.showOmniDropdown = false; }, 200);
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    mounted() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser     = user.uid;
                this.currentUserName = user.displayName || user.email || user.uid;

                // ── Enregistrement de l'utilisateur dans le registre ──
                try {
                    const userRef  = doc(dbFirestore, "users_registry", user.uid);
                    const userSnap = await getDoc(userRef);
                    const prevCount = userSnap.exists() ? (userSnap.data().loginCount || 0) : 0;
                    await setDoc(userRef, {
                        uid:        user.uid,
                        email:      user.email,
                        lastLogin:  new Date().toISOString(),
                        createdAt:  user.metadata?.creationTime || new Date().toISOString(),
                        loginCount: prevCount + 1,
                    }, { merge: true });
                } catch (e) { console.warn("Registre utilisateur:", e); }

                // ── Écoute de la config admin (changelog + adminEmails) ──
                onSnapshot(doc(dbFirestore, "shared", "config"), (snap) => {
                    if (snap.exists()) {
                        const cfg = snap.data();
                        this.adminEmails    = cfg.adminEmails || [];
                        this.adminChangelog = cfg.changelog   || [];
                        this.isAdmin        = this.adminEmails.includes(user.email);
                        // Afficher la dernière note de version si pas encore vue
                        if (this.adminChangelog.length > 0 && !this.changelogDismissed) {
                            this.latestChangelog    = this.adminChangelog[0];
                            this.showChangelogBanner = true;
                        }
                    } else {
                        // Premier lancement : initialiser avec l'email courant comme admin
                        this.adminEmails = [user.email];
                        this.isAdmin     = true;
                        this.saveAdminConfig();
                    }
                });
                // Données privées (projets, tâches, affaires, templates)
                onSnapshot(doc(dbFirestore, "users", this.currentUser), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        this.db.projects        = data.projects        || [];
                        this.db.tasks           = data.tasks           || [];
                        this.db.events          = data.events          || [];
                        this.db.templates       = data.templates       || this.db.templates;
                        this.db.campaignHistory = data.campaignHistory || [];
                    } else {
                        // Migration depuis localStorage si première connexion
                        const savedPrivate = localStorage.getItem(`bobBookingDB_${this.currentUser}`);
                        if (savedPrivate) {
                            try {
                                const parsed = JSON.parse(savedPrivate);
                                this.db.projects = parsed.projects || [];
                                this.db.tasks    = parsed.tasks    || [];
                                this.db.events   = parsed.events   || [];
                                this.saveDB();
                            } catch (e) { console.error('Erreur lecture DB locale privée'); }
                        } else {
                            this.db.projects = []; this.db.tasks = []; this.db.events = [];
                        }
                    }
                    // Sélectionner tous les projets par défaut au chargement
                    if (this.selectedProjectIds.length === 0 && this.db.projects.length > 0) {
                        this.selectedProjectIds = this.db.projects.map(p => p.id);
                    }
                });
                onSnapshot(doc(dbFirestore, "shared", "annuaire"), (docSnap) => {
    if (docSnap.exists()) {
        const d = docSnap.data();
        this.db.structures = d.structures || [];
        
        // C'est ici qu'on récupère la "Bibliothèque" des tags
        if (d.tagCategories) this.db.tagCategories = d.tagCategories;
        if (d.tagGenres)     this.db.tagGenres     = d.tagGenres;
        if (d.tagReseaux)    this.db.tagReseaux    = d.tagReseaux;
        if (d.tagKeywords)   this.db.tagKeywords   = d.tagKeywords;
        
        console.log("Bibliothèque de tags mise à jour !");
    }
});

                // Annuaire partagé
                onSnapshot(doc(dbFirestore, "shared", "annuaire"), (docSnap) => {
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        this.db.structures = d.structures    || [];
                        this.db.tagCategories = d.tagCategories || this.db.tagCategories;
                        this.db.tagGenres     = d.tagGenres     || this.db.tagGenres;
                        this.db.tagReseaux    = d.tagReseaux    || this.db.tagReseaux;
                        this.db.tagKeywords   = d.tagKeywords   || this.db.tagKeywords;
                        // Migration automatique : si les tags n'existent pas encore dans Firebase,
                        // on les écrit immédiatement (une seule fois, transparente pour l'utilisateur)
                        if (!d.tagCategories) {
                            console.log('[Migration] Écriture des tags dans Firebase...');
                            this.saveDB();
                        }
                    } else {
                        const oldLocal = localStorage.getItem('bobBookingDB');
                        if (oldLocal) {
                            try {
                                const oldDb = JSON.parse(oldLocal);
                                if (oldDb.structures && oldDb.structures.length > 0) {
                                    this.db.structures = oldDb.structures;
                                    this.saveDB();
                                }
                            } catch (e) { console.error('Erreur migration annuaire'); }
                        } else {
                            this.db.structures = [];
                        }
                    }
                });

            } else {
                this.currentUser = null;
                this.currentUserName = '';
            }
        });
    },

}).mount('#app');
