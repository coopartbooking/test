// helpMethods.js — Onglet Aide et boutons « ? » des écrans
//
// Les pages d'aide (mode d'emploi + visites guidées) sont des fichiers HTML
// autonomes rangés dans aide/. Elles s'ouvrent dans une fenêtre par-dessus Bob
// (iframe), pour qu'on ne quitte jamais l'application.
//
// Cache : le service worker garde en cache toute ressource locale sous son URL
// exacte. On ajoute donc ?v=<version de Bob> à chaque page d'aide : une
// nouvelle version de Bob = de nouvelles URL = des pages d'aide à jour. La
// version est lue sur l'URL de ce module, que bump-version.py tient à jour.

const HELP_V = (() => {
    try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch (e) { return ''; }
})();

// Les visites guidées, dans l'ordre du menu.
export const HELP_TOURS = [
    { file: 'visite-taches.html',          icon: 'fa-tasks',          color: 'text-orange-500',  bg: 'bg-orange-50',
      title: 'Tâches & Suivi',             text: 'Créer une tâche, la cocher avec un compte-rendu, retrouver les relances.' },
    { file: 'visite-annuaire.html',        icon: 'fa-address-book',   color: 'text-sky-600',     bg: 'bg-sky-50',
      title: "L'annuaire",                 text: 'Structures & Lieux et Annuaire Pro : trouver, compléter une fiche, cibler des contacts.' },
    { file: 'visite-projets.html',         icon: 'fa-music',          color: 'text-violet-600',  bg: 'bg-violet-50',
      title: 'Les projets',                text: 'Créer un projet, sa fiche et ses onglets, les notes et actions.' },
    { file: 'visite-affaire.html',         icon: 'fa-columns',        color: 'text-yellow-600',  bg: 'bg-yellow-50',
      title: 'Gérer une affaire',          text: 'Le pipeline, la fiche affaire, le contrat, les relances, la confirmation.' },
    { file: 'visite-agenda.html',          icon: 'fa-calendar-alt',   color: 'text-indigo-600',  bg: 'bg-indigo-50',
      title: "L'agenda",                   text: 'Vues mois et liste, ajouter depuis un jour, abonner son agenda habituel.' },
    { file: 'visite-carte-campagnes.html', icon: 'fa-map-marked-alt', color: 'text-emerald-600', bg: 'bg-emerald-50',
      title: 'Carte et campagnes',         text: "Cibler une zone sur la carte, puis envoyer une invitation personnalisée." },
    { file: 'visite-parametres.html',      icon: 'fa-cog',            color: 'text-slate-500',   bg: 'bg-slate-100',
      title: 'Les Paramètres',             text: 'Modèles de contrat et listes de tags.' },
];

// Écran de Bob → page d'aide ouverte par son bouton « ? ».
const HELP_FOR_TAB = {
    dashboard:  'mode-emploi.html#2-tableau-de-bord',
    tasks:      'visite-taches.html',
    structures: 'visite-annuaire.html',
    contacts:   'visite-annuaire.html',
    projects:   'visite-projets.html',
    pipeline:   'visite-affaire.html',
    planning:   'visite-agenda.html',
    geo:        'visite-carte-campagnes.html',
    mailing:    'visite-carte-campagnes.html',
    settings:   'visite-parametres.html',
    admin:      'mode-emploi.html#annexe-administration',
};

export const helpMethods = {
    helpPageFor(tab) {
        return HELP_FOR_TAB[tab] || null;
    },

    // Construit l'URL d'une page d'aide : version (cache) et, pour les
    // administrateurs, l'annexe Administration du mode d'emploi.
    helpUrl(page) {
        const [path, hash] = String(page).split('#');
        const params = new URLSearchParams();
        if (HELP_V) params.set('v', HELP_V);
        if (this.isAdmin && path === 'mode-emploi.html') params.set('admin', '1');
        const q = params.toString();
        return 'aide/' + path + (q ? '?' + q : '') + (hash ? '#' + hash : '');
    },

    helpTitle(page) {
        const path = String(page).split('#')[0];
        if (path === 'mode-emploi.html') return "Mode d'emploi";
        const t = HELP_TOURS.find(x => x.file === path);
        return t ? 'Visite guidée : ' + t.title : 'Aide';
    },

    openHelp(page) {
        if (!page) return;
        const url = this.helpUrl(page);
        // src : ce que l'iframe charge ; current : la page affichée (elle
        // change quand on suit un lien dans l'aide, sans toucher à src).
        this.helpViewer = { src: url, current: url, title: this.helpTitle(page), history: [], skipNext: false };
    },

    closeHelp() {
        this.helpViewer = null;
    },

    // Un lien suivi à l'intérieur de la fenêtre (mode d'emploi → visite) :
    // on met à jour le titre et on garde la page précédente pour « Retour ».
    onHelpFrameLoad(ev) {
        const v = this.helpViewer;
        if (!v) return;
        let href = '';
        try { href = ev.target.contentWindow.location.href; } catch (e) { return; }
        const rel = (href || '').split('/aide/')[1];
        if (!rel) return;
        const page = rel.split('?')[0].split('#')[0];
        if (v.skipNext) {
            v.skipNext = false;
        } else if (page !== v.current.replace(/^aide\//, '').split('?')[0].split('#')[0]) {
            v.history.push(v.current);
        }
        v.current = 'aide/' + rel;
        v.title = this.helpTitle(page);
    },

    helpBack() {
        const v = this.helpViewer;
        const frame = this.$refs.helpFrame;
        if (!v || !v.history.length || !frame) return;
        const prev = v.history.pop();
        v.skipNext = true;
        try {
            frame.contentWindow.location.replace(new URL(prev, location.href).href);
        } catch (e) {
            v.src = prev; v.skipNext = false;
        }
    },
};
