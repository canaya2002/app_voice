import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Lang = 'en' | 'es' | 'it' | 'fr' | 'pt';

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
  pt: 'Português',
};

// ── Translation dictionary ──────────────────────────────────────────────────

const T: Record<string, Record<Lang, string>> = {
  // ── Auth ─────────────────────────────────────────────────────────────
  'auth.welcome': { en: 'Welcome back', es: 'Bienvenido', it: 'Bentornato', fr: 'Bienvenue', pt: 'Bem-vindo' },
  'auth.createAccount': { en: 'Create account', es: 'Crear cuenta', it: 'Crea account', fr: 'Créer un compte', pt: 'Criar conta' },
  'auth.accessNotes': { en: 'Access your voice notes', es: 'Accede a tus notas de voz', it: 'Accedi alle tue note vocali', fr: 'Accédez à vos notes vocales', pt: 'Acesse suas notas de voz' },
  'auth.freeNoCc': { en: 'Free, no credit card required', es: 'Gratis, sin tarjeta de crédito', it: 'Gratis, senza carta di credito', fr: 'Gratuit, sans carte de crédit', pt: 'Grátis, sem cartão de crédito' },
  'auth.yourName': { en: 'Your name', es: 'Tu nombre', it: 'Il tuo nome', fr: 'Votre nom', pt: 'Seu nome' },
  'auth.email': { en: 'Email', es: 'Email', it: 'Email', fr: 'Email', pt: 'Email' },
  'auth.password': { en: 'Password', es: 'Contraseña', it: 'Password', fr: 'Mot de passe', pt: 'Senha' },
  'auth.passwordMin': { en: 'Password (min. 8)', es: 'Contraseña (mín. 8)', it: 'Password (min. 8)', fr: 'Mot de passe (min. 8)', pt: 'Senha (mín. 8)' },
  'auth.signIn': { en: 'Sign in', es: 'Iniciar sesión', it: 'Accedi', fr: 'Se connecter', pt: 'Entrar' },
  'auth.createFree': { en: 'Create free account', es: 'Crear cuenta gratis', it: 'Crea account gratis', fr: 'Créer un compte gratuit', pt: 'Criar conta grátis' },
  'auth.orContinue': { en: 'or continue with', es: 'o continúa con', it: 'o continua con', fr: 'ou continuer avec', pt: 'ou continue com' },
  'auth.noAccount': { en: "Don't have an account? ", es: '¿No tienes cuenta? ', it: 'Non hai un account? ', fr: "Pas de compte ? ", pt: 'Não tem conta? ' },
  'auth.hasAccount': { en: 'Already have an account? ', es: '¿Ya tienes cuenta? ', it: 'Hai già un account? ', fr: 'Déjà un compte ? ', pt: 'Já tem conta? ' },
  'auth.signUpFree': { en: 'Sign up free', es: 'Regístrate gratis', it: 'Registrati gratis', fr: "S'inscrire gratuitement", pt: 'Cadastre-se grátis' },
  'auth.checkEmail': { en: 'Check your email to confirm your account.', es: 'Revisa tu correo para confirmar tu cuenta.', it: 'Controlla la tua email per confermare.', fr: 'Vérifiez votre email pour confirmer.', pt: 'Verifique seu email para confirmar.' },

  // ── Auth Demo Login ──────────────────────────────────────────────────
  'demo.login.title': { en: 'Your voice, into action', es: 'Tu voz, hecha accion', it: 'La tua voce, in azione', fr: 'Votre voix, en action', pt: 'Sua voz, em ação' },
  'demo.login.sub': { en: 'See how Sythio turns a meeting into a summary and tasks.', es: 'Mira como Sythio transforma una reunion en resumen y tareas.', it: 'Guarda come Sythio trasforma una riunione in riassunto e attività.', fr: 'Voyez comment Sythio transforme une réunion en résumé et tâches.', pt: 'Veja como Sythio transforma uma reunião em resumo e tarefas.' },
  'demo.login.liveTranscript': { en: 'Live transcription', es: 'Transcripcion en vivo', it: 'Trascrizione in diretta', fr: 'Transcription en direct', pt: 'Transcrição ao vivo' },
  'demo.login.summary': { en: 'Summary', es: 'Resumen', it: 'Riassunto', fr: 'Résumé', pt: 'Resumo' },
  'demo.login.step0': { en: 'Recording meeting...', es: 'Grabando reunion...', it: 'Registrando riunione...', fr: 'Enregistrement réunion...', pt: 'Gravando reunião...' },
  'demo.login.step1': { en: 'Transcribing...', es: 'Transcribiendo...', it: 'Trascrivendo...', fr: 'Transcription...', pt: 'Transcrevendo...' },
  'demo.login.step2': { en: 'AI analyzing...', es: 'IA analizando...', it: 'IA in analisi...', fr: 'IA en analyse...', pt: 'IA analisando...' },
  'demo.login.step3': { en: 'Done — summary and tasks generated', es: 'Listo — resumen y tareas generados', it: 'Fatto — riassunto e attività generati', fr: 'Terminé — résumé et tâches générés', pt: 'Pronto — resumo e tarefas gerados' },
  'demo.login.languages': { en: 'languages', es: 'idiomas', it: 'lingue', fr: 'langues', pt: 'idiomas' },
  'demo.login.aiModes': { en: 'AI modes', es: 'modos de IA', it: 'modalità IA', fr: "modes d'IA", pt: 'modos de IA' },

  // ── Auth Demo Login — content ─────────────────────────────────────────
  'demo.login.transcript': {
    en: 'Ok team, the project deadline is Friday. María handles design, Carlos the backend and Ana coordinates testing. Deploy before 5pm.',
    es: 'Ok equipo, el deadline del proyecto es viernes. María se encarga del diseño, Carlos del backend y Ana coordina las pruebas. Deploy antes de las 5pm.',
    it: 'Ok team, la scadenza del progetto è venerdì. María si occupa del design, Carlos del backend e Ana coordina i test. Deploy entro le 17.',
    fr: "Ok équipe, la deadline du projet est vendredi. María s'occupe du design, Carlos du backend et Ana coordonne les tests. Deploy avant 17h.",
    pt: 'Ok equipe, o prazo do projeto é sexta-feira. María cuida do design, Carlos do backend e Ana coordena os testes. Deploy antes das 17h.',
  },
  'demo.login.sum1': {
    en: 'The team has a Friday deadline for the deploy.',
    es: 'El equipo tiene deadline el viernes para el deploy.',
    it: 'Il team ha scadenza venerdì per il deploy.',
    fr: "L'équipe a une deadline vendredi pour le deploy.",
    pt: 'A equipe tem prazo na sexta para o deploy.',
  },
  'demo.login.sum2': {
    en: 'Three people assigned with clear tasks.',
    es: 'Tres responsables asignados con tareas claras.',
    it: 'Tre responsabili assegnati con compiti chiari.',
    fr: 'Trois responsables assignés avec des tâches claires.',
    pt: 'Três responsáveis designados com tarefas claras.',
  },
  'demo.login.sum3': {
    en: 'Coordination needed to meet the 5pm deadline.',
    es: 'Se requiere coordinación para cumplir antes de las 5pm.',
    it: 'Coordinamento necessario per rispettare le 17.',
    fr: 'Coordination nécessaire pour respecter la deadline de 17h.',
    pt: 'Coordenação necessária para cumprir antes das 17h.',
  },
  'demo.login.task1': { en: 'Complete UI/UX design', es: 'Completar diseño UI/UX', it: 'Completare design UI/UX', fr: 'Finaliser le design UI/UX', pt: 'Completar design UI/UX' },
  'demo.login.task2': { en: 'Finalize backend and API', es: 'Finalizar backend y API', it: 'Finalizzare backend e API', fr: 'Finaliser le backend et API', pt: 'Finalizar backend e API' },
  'demo.login.task3': { en: 'Run QA tests', es: 'Ejecutar pruebas QA', it: 'Eseguire test QA', fr: 'Exécuter les tests QA', pt: 'Executar testes QA' },

  // ── Auth Demo Register — content ─────────────────────────────────────
  'demo.reg.speaker1': {
    en: 'I want to launch the campaign next week with 3 influencers.',
    es: 'Quiero lanzar la campaña la próxima semana con 3 influencers.',
    it: 'Voglio lanciare la campagna la prossima settimana con 3 influencer.',
    fr: 'Je veux lancer la campagne la semaine prochaine avec 3 influenceurs.',
    pt: 'Quero lançar a campanha na próxima semana com 3 influencers.',
  },
  'demo.reg.speaker2': {
    en: 'Got it. Generating action plan with dates and owners...',
    es: 'Entendido. Generando plan de acción con fechas y responsables...',
    it: 'Capito. Generazione piano d\'azione con date e responsabili...',
    fr: "Compris. Génération du plan d'action avec dates et responsables...",
    pt: 'Entendido. Gerando plano de ação com datas e responsáveis...',
  },
  'demo.reg.you': { en: 'You', es: 'Tu', it: 'Tu', fr: 'Vous', pt: 'Você' },
  'demo.reg.filename': { en: 'campaign_plan.docx', es: 'plan_campaña.docx', it: 'piano_campagna.docx', fr: 'plan_campagne.docx', pt: 'plano_campanha.docx' },
  'demo.reg.fileMeta': {
    en: '2 speakers · 4 modes · Exported',
    es: '2 hablantes · 4 modos · Exportado',
    it: '2 parlanti · 4 modalità · Esportato',
    fr: '2 intervenants · 4 modes · Exporté',
    pt: '2 falantes · 4 modos · Exportado',
  },

  // ── Auth Demo Register ───────────────────────────────────────────────
  'demo.reg.title': { en: 'Ready in seconds', es: 'Todo listo en segundos', it: 'Pronto in pochi secondi', fr: 'Prêt en quelques secondes', pt: 'Pronto em segundos' },
  'demo.reg.sub': { en: 'Dictate an idea and get a full exportable plan instantly.', es: 'Dicta una idea y obtén un plan completo exportable al instante.', it: 'Dettare un\'idea e ottieni un piano esportabile all\'istante.', fr: 'Dictez une idée et obtenez un plan exportable instantanément.', pt: 'Dite uma ideia e obtenha um plano exportável instantaneamente.' },
  'demo.reg.step0': { en: 'Recording idea...', es: 'Grabando idea...', it: 'Registrando idea...', fr: 'Enregistrement idée...', pt: 'Gravando ideia...' },
  'demo.reg.step1': { en: 'Processing audio...', es: 'Procesando audio...', it: 'Elaborazione audio...', fr: 'Traitement audio...', pt: 'Processando áudio...' },
  'demo.reg.step2': { en: 'Generating 4 AI modes...', es: 'Generando 4 modos con IA...', it: 'Generazione 4 modalità IA...', fr: 'Génération de 4 modes IA...', pt: 'Gerando 4 modos com IA...' },
  'demo.reg.step3': { en: 'Exported — ready to share', es: 'Exportado — listo para compartir', it: 'Esportato — pronto da condividere', fr: 'Exporté — prêt à partager', pt: 'Exportado — pronto para compartilhar' },
  'demo.reg.users': { en: 'users', es: 'usuarios', it: 'utenti', fr: 'utilisateurs', pt: 'usuários' },
  'demo.reg.notes': { en: 'notes', es: 'notas', it: 'note', fr: 'notes', pt: 'notas' },

  // ── Nav ──────────────────────────────────────────────────────────────
  'nav.workspaces': { en: 'Workspaces', es: 'Workspaces', it: 'Workspaces', fr: 'Workspaces', pt: 'Workspaces' },
  'nav.integrations': { en: 'Integrations', es: 'Integraciones', it: 'Integrazioni', fr: 'Intégrations', pt: 'Integrações' },
  'nav.settings': { en: 'Settings', es: 'Configuración', it: 'Impostazioni', fr: 'Paramètres', pt: 'Configurações' },
  'nav.trash': { en: 'Trash', es: 'Papelera', it: 'Cestino', fr: 'Corbeille', pt: 'Lixeira' },
  'nav.theme': { en: 'Toggle theme', es: 'Cambiar tema', it: 'Cambia tema', fr: 'Changer thème', pt: 'Mudar tema' },
  'nav.logout': { en: 'Sign out', es: 'Cerrar sesión', it: 'Esci', fr: 'Déconnexion', pt: 'Sair' },

  // ── Dashboard ────────────────────────────────────────────────────────
  'dash.library': { en: 'Library', es: 'Biblioteca', it: 'Libreria', fr: 'Bibliothèque', pt: 'Biblioteca' },
  'dash.note': { en: 'note', es: 'nota', it: 'nota', fr: 'note', pt: 'nota' },
  'dash.notes': { en: 'notes', es: 'notas', it: 'note', fr: 'notes', pt: 'notas' },
  'dash.organized': { en: 'Organized and ready', es: 'Organizadas y listas', it: 'Organizzate e pronte', fr: 'Organisées et prêtes', pt: 'Organizadas e prontas' },
  'dash.search': { en: 'Search by title, content or topic...', es: 'Buscar por título, contenido o tema...', it: 'Cerca per titolo, contenuto o argomento...', fr: 'Rechercher par titre, contenu ou sujet...', pt: 'Buscar por título, conteúdo ou tema...' },
  'dash.all': { en: 'All', es: 'Todas', it: 'Tutte', fr: 'Toutes', pt: 'Todas' },
  'dash.meetings': { en: 'Meetings', es: 'Reuniones', it: 'Riunioni', fr: 'Réunions', pt: 'Reuniões' },
  'dash.tasks': { en: 'Tasks', es: 'Tareas', it: 'Attività', fr: 'Tâches', pt: 'Tarefas' },
  'dash.ideas': { en: 'Ideas', es: 'Ideas', it: 'Idee', fr: 'Idées', pt: 'Ideias' },
  'dash.conversations': { en: 'Conversations', es: 'Conversaciones', it: 'Conversazioni', fr: 'Conversations', pt: 'Conversas' },
  'dash.select': { en: 'Select', es: 'Seleccionar', it: 'Seleziona', fr: 'Sélectionner', pt: 'Selecionar' },
  'dash.export': { en: 'Export', es: 'Exportar', it: 'Esporta', fr: 'Exporter', pt: 'Exportar' },
  'dash.noResults': { en: 'No results', es: 'Sin resultados', it: 'Nessun risultato', fr: 'Aucun résultat', pt: 'Sem resultados' },
  'dash.libraryReady': { en: 'Your library is ready', es: 'Tu biblioteca está lista', it: 'La tua libreria è pronta', fr: 'Votre bibliothèque est prête', pt: 'Sua biblioteca está pronta' },
  'dash.noResultsHint': { en: 'Try different terms or adjust filters.', es: 'Intenta con otros términos o ajusta los filtros.', it: 'Prova con altri termini o modifica i filtri.', fr: "Essayez d'autres termes ou ajustez les filtres.", pt: 'Tente outros termos ou ajuste os filtros.' },
  'dash.emptyHint': { en: 'Your processed notes will appear here — ready to review, organize and export.', es: 'Aquí aparecerán tus notas procesadas — listas para revisar, organizar y exportar.', it: 'Qui appariranno le tue note elaborate — pronte per revisione, organizzazione ed esportazione.', fr: 'Vos notes traitées apparaîtront ici — prêtes à consulter, organiser et exporter.', pt: 'Suas notas processadas aparecerão aqui — prontas para revisar, organizar e exportar.' },
  'dash.speakers': { en: 'speakers', es: 'hablantes', it: 'parlanti', fr: 'intervenants', pt: 'falantes' },
  'dash.allFolders': { en: 'All', es: 'Todas', it: 'Tutte', fr: 'Toutes', pt: 'Todas' },

  // ── Trash ────────────────────────────────────────────────────────────
  'trash.title': { en: 'Trash', es: 'Papelera', it: 'Cestino', fr: 'Corbeille', pt: 'Lixeira' },
  'trash.autoDelete': { en: 'Auto-deleted after 30 days', es: 'Se eliminan automáticamente después de 30 días', it: 'Eliminazione automatica dopo 30 giorni', fr: 'Suppression automatique après 30 jours', pt: 'Excluídas automaticamente após 30 dias' },
  'trash.backHome': { en: '← Back to home', es: '← Volver al inicio', it: '← Torna alla home', fr: '← Retour', pt: '← Voltar ao início' },
  'trash.empty': { en: 'Trash is empty', es: 'Papelera vacía', it: 'Cestino vuoto', fr: 'Corbeille vide', pt: 'Lixeira vazia' },
  'trash.emptyHint': { en: 'Deleted notes appear here for 30 days.', es: 'Las notas eliminadas aparecen aquí por 30 días.', it: 'Le note eliminate appaiono qui per 30 giorni.', fr: 'Les notes supprimées apparaissent ici pendant 30 jours.', pt: 'Notas excluídas aparecem aqui por 30 dias.' },
  'trash.deletedOn': { en: 'Deleted on', es: 'Eliminada el', it: 'Eliminata il', fr: 'Supprimée le', pt: 'Excluída em' },
  'trash.restore': { en: 'Restore', es: 'Restaurar', it: 'Ripristina', fr: 'Restaurer', pt: 'Restaurar' },
  'trash.delete': { en: 'Delete', es: 'Eliminar', it: 'Elimina', fr: 'Supprimer', pt: 'Excluir' },
  'trash.permDelete': { en: 'Delete permanently? This cannot be undone.', es: '¿Eliminar permanentemente? Esta acción no se puede deshacer.', it: 'Eliminare definitivamente? Non può essere annullato.', fr: 'Supprimer définitivement ? Cette action est irréversible.', pt: 'Excluir permanentemente? Esta ação não pode ser desfeita.' },

  // ── Note Detail ──────────────────────────────────────────────────────
  'note.back': { en: '← Back', es: '← Volver', it: '← Indietro', fr: '← Retour', pt: '← Voltar' },
  'note.moveTrash': { en: 'Move to trash?', es: '¿Mover esta nota a la papelera?', it: 'Spostare nel cestino?', fr: 'Déplacer vers la corbeille ?', pt: 'Mover para a lixeira?' },
  'note.trash': { en: 'Trash', es: 'Papelera', it: 'Cestino', fr: 'Corbeille', pt: 'Lixeira' },
  'note.save': { en: 'Save', es: 'Guardar', it: 'Salva', fr: 'Enregistrer', pt: 'Salvar' },
  'note.cancel': { en: 'Cancel', es: 'Cancelar', it: 'Annulla', fr: 'Annuler', pt: 'Cancelar' },
  'note.noFolder': { en: 'No folder', es: 'Sin carpeta', it: 'Nessuna cartella', fr: 'Aucun dossier', pt: 'Sem pasta' },
  'note.copyLink': { en: 'Copy link', es: 'Copiar link', it: 'Copia link', fr: 'Copier le lien', pt: 'Copiar link' },
  'note.generating': { en: 'Generating...', es: 'Generando...', it: 'Generando...', fr: 'Génération...', pt: 'Gerando...' },
  'note.copySummary': { en: 'Copy summary', es: 'Copiar resumen', it: 'Copia riassunto', fr: 'Copier le résumé', pt: 'Copiar resumo' },
  'note.transcript': { en: 'Transcript', es: 'Transcripción', it: 'Trascrizione', fr: 'Transcription', pt: 'Transcrição' },
  'note.channel': { en: 'Channel', es: 'Canal', it: 'Canale', fr: 'Canal', pt: 'Canal' },
  'note.shareToChannel': { en: 'Share to channel', es: 'Compartir a canal', it: 'Condividi nel canale', fr: 'Partager dans le canal', pt: 'Compartilhar no canal' },
  'note.publicLink': { en: 'Public link active', es: 'Link público activo', it: 'Link pubblico attivo', fr: 'Lien public actif', pt: 'Link público ativo' },
  'note.copy': { en: 'Copy', es: 'Copiar', it: 'Copia', fr: 'Copier', pt: 'Copiar' },
  'note.speakers': { en: 'Speakers', es: 'Hablantes', it: 'Parlanti', fr: 'Intervenants', pt: 'Falantes' },
  'note.speakersRename': { en: '— click to rename', es: '— click para renombrar', it: '— clicca per rinominare', fr: '— cliquez pour renommer', pt: '— clique para renomear' },
  'note.images': { en: 'Images', es: 'Imágenes', it: 'Immagini', fr: 'Images', pt: 'Imagens' },
  'note.addImage': { en: '+ Image', es: '+ Imagen', it: '+ Immagine', fr: '+ Image', pt: '+ Imagem' },
  'note.comments': { en: 'Comments', es: 'Comentarios', it: 'Commenti', fr: 'Commentaires', pt: 'Comentários' },
  'note.noComments': { en: 'No comments yet. Be the first.', es: 'Sin comentarios aún. Sé el primero en comentar.', it: 'Nessun commento. Sii il primo.', fr: 'Aucun commentaire. Soyez le premier.', pt: 'Sem comentários. Seja o primeiro.' },
  'note.writeComment': { en: 'Write a comment...', es: 'Escribe un comentario...', it: 'Scrivi un commento...', fr: 'Écrire un commentaire...', pt: 'Escreva um comentário...' },
  'note.send': { en: 'Send', es: 'Enviar', it: 'Invia', fr: 'Envoyer', pt: 'Enviar' },
  'note.fullTranscript': { en: 'Full transcript', es: 'Transcripción completa', it: 'Trascrizione completa', fr: 'Transcription complète', pt: 'Transcrição completa' },
  'note.clickHighlight': { en: 'Click to highlight', es: 'Click para resaltar', it: 'Clicca per evidenziare', fr: 'Cliquez pour surligner', pt: 'Clique para destacar' },
  'note.notFound': { en: 'Note not found', es: 'Nota no encontrada', it: 'Nota non trovata', fr: 'Note introuvable', pt: 'Nota não encontrada' },

  // ── Shared ───────────────────────────────────────────────────────────
  'shared.via': { en: 'Shared via Sythio', es: 'Compartido via Sythio', it: 'Condiviso via Sythio', fr: 'Partagé via Sythio', pt: 'Compartilhado via Sythio' },
  'shared.notFound': { en: 'Note not found or link expired.', es: 'Nota no encontrada o link expirado.', it: 'Nota non trovata o link scaduto.', fr: 'Note introuvable ou lien expiré.', pt: 'Nota não encontrada ou link expirado.' },
  'shared.madeWith': { en: 'Made with Sythio', es: 'Hecho con Sythio', it: 'Creato con Sythio', fr: 'Créé avec Sythio', pt: 'Feito com Sythio' },
  'shared.cta': { en: 'Transform your voice recordings into summaries, tasks, reports and more with AI.', es: 'Transforma tus grabaciones de voz en resúmenes, tareas, reportes y más con IA.', it: 'Trasforma le tue registrazioni vocali in riassunti, attività, report e altro con IA.', fr: 'Transformez vos enregistrements vocaux en résumés, tâches, rapports et plus avec l\'IA.', pt: 'Transforme suas gravações de voz em resumos, tarefas, relatórios e mais com IA.' },
  'shared.tryFree': { en: 'Try Sythio free', es: 'Prueba Sythio gratis', it: 'Prova Sythio gratis', fr: 'Essayez Sythio gratuitement', pt: 'Experimente Sythio grátis' },

  // ── Common ───────────────────────────────────────────────────────────
  'common.copied': { en: 'Copied to clipboard', es: 'Copiado al portapapeles', it: 'Copiato negli appunti', fr: 'Copié dans le presse-papier', pt: 'Copiado para a área de transferência' },
  'common.linkCopied': { en: 'Link copied', es: 'Link copiado', it: 'Link copiato', fr: 'Lien copié', pt: 'Link copiado' },
  'common.error': { en: 'Error', es: 'Error', it: 'Errore', fr: 'Erreur', pt: 'Erro' },
  'common.confirm': { en: 'Confirm', es: 'Confirmar', it: 'Conferma', fr: 'Confirmer', pt: 'Confirmar' },
  'common.cancel': { en: 'Cancel', es: 'Cancelar', it: 'Annulla', fr: 'Annuler', pt: 'Cancelar' },
  'common.processing': { en: 'Processing...', es: 'Procesando...', it: 'Elaborazione...', fr: 'Traitement...', pt: 'Processando...' },
  'common.errorAction': { en: 'Error processing action', es: 'Error al procesar la acción', it: "Errore nell'elaborazione", fr: "Erreur lors du traitement", pt: 'Erro ao processar a ação' },
  'common.delete': { en: 'Delete', es: 'Eliminar', it: 'Elimina', fr: 'Supprimer', pt: 'Excluir' },
  'common.back': { en: 'Back', es: 'Volver', it: 'Indietro', fr: 'Retour', pt: 'Voltar' },

  // ── Toast messages ────────────────────────────────────────────────────
  'toast.noWorkspaces': { en: 'No workspaces. Create one from Workspaces.', es: 'No tienes workspaces. Crea uno desde Workspaces.', it: 'Nessun workspace. Creane uno da Workspaces.', fr: 'Aucun workspace. Créez-en un depuis Workspaces.', pt: 'Sem workspaces. Crie um em Workspaces.' },
  'toast.noChannels': { en: 'No channels in your workspaces. Create one first.', es: 'No hay canales en tus workspaces. Crea uno primero.', it: 'Nessun canale nei tuoi workspace. Creane uno prima.', fr: 'Aucun canal dans vos workspaces. Créez-en un.', pt: 'Sem canais nos seus workspaces. Crie um primeiro.' },
  'toast.alreadyShared': { en: 'Already shared in that channel', es: 'Ya está compartida en ese canal', it: 'Già condiviso in quel canale', fr: 'Déjà partagé dans ce canal', pt: 'Já compartilhado nesse canal' },
  'toast.sharedIn': { en: 'Shared in', es: 'Compartida en', it: 'Condiviso in', fr: 'Partagé dans', pt: 'Compartilhado em' },
  'toast.slackBadUrl': { en: 'URL must start with https://hooks.slack.com/', es: 'URL debe empezar con https://hooks.slack.com/', it: 'URL deve iniziare con https://hooks.slack.com/', fr: 'URL doit commencer par https://hooks.slack.com/', pt: 'URL deve começar com https://hooks.slack.com/' },
  'toast.slackConnected': { en: 'Slack connected. You\'ll receive summaries automatically.', es: 'Slack conectado. Recibirás resúmenes automáticamente.', it: 'Slack connesso. Riceverai i riassunti automaticamente.', fr: 'Slack connecté. Vous recevrez les résumés automatiquement.', pt: 'Slack conectado. Você receberá resumos automaticamente.' },
  'toast.profileSaved': { en: 'Profile saved', es: 'Perfil guardado', it: 'Profilo salvato', fr: 'Profil enregistré', pt: 'Perfil salvo' },
  'toast.saveError': { en: 'Error saving', es: 'Error al guardar', it: 'Errore nel salvataggio', fr: "Erreur lors de l'enregistrement", pt: 'Erro ao salvar' },
  'toast.resetSent': { en: 'Reset email sent to', es: 'Email de restablecimiento enviado a', it: 'Email di reset inviata a', fr: 'Email de réinitialisation envoyé à', pt: 'Email de redefinição enviado para' },
  'toast.cancelError': { en: 'Error cancelling. Contact support@sythio.app', es: 'Error al cancelar. Contacta soporte@sythio.app', it: 'Errore nella cancellazione. Contatta support@sythio.app', fr: "Erreur d'annulation. Contactez support@sythio.app", pt: 'Erro ao cancelar. Contate support@sythio.app' },
  'toast.subCancelled': { en: 'Subscription cancelled. Access continues until end of period.', es: 'Suscripción cancelada. Tu acceso continúa hasta el fin del periodo.', it: 'Abbonamento cancellato. Accesso fino a fine periodo.', fr: "Abonnement annulé. Accès jusqu'à la fin de la période.", pt: 'Assinatura cancelada. Acesso até o fim do período.' },
  'toast.deleteError': { en: 'Error deleting account:', es: 'Error al eliminar cuenta:', it: "Errore nell'eliminazione account:", fr: 'Erreur de suppression du compte :', pt: 'Erro ao excluir conta:' },
  'toast.accountDeleted': { en: 'Account deleted. All your data has been removed.', es: 'Cuenta eliminada. Todos tus datos han sido borrados.', it: 'Account eliminato. Tutti i tuoi dati sono stati rimossi.', fr: 'Compte supprimé. Toutes vos données ont été effacées.', pt: 'Conta excluída. Todos os seus dados foram removidos.' },
  'toast.apiKeyCopied': { en: 'API key copied', es: 'API key copiada', it: 'API key copiata', fr: 'Clé API copiée', pt: 'Chave API copiada' },
  'toast.linkCopiedClip': { en: 'Link copied to clipboard', es: 'Link copiado al portapapeles', it: 'Link copiato negli appunti', fr: 'Lien copié dans le presse-papier', pt: 'Link copiado para a área de transferência' },
  'toast.errorGeneratingLink': { en: 'Error generating link', es: 'Error al generar link', it: 'Errore nella generazione del link', fr: 'Erreur de génération du lien', pt: 'Erro ao gerar link' },

  // ── Confirm messages ─────────────────────────────────────────────────
  'confirm.cancelSub': { en: 'Cancel your subscription? You\'ll keep access until the end of the current period.', es: '¿Cancelar tu suscripción? Mantendrás el acceso hasta el final del periodo actual.', it: 'Cancellare il tuo abbonamento? Manterrai l\'accesso fino alla fine del periodo.', fr: "Annuler votre abonnement ? Vous garderez l'accès jusqu'à la fin de la période.", pt: 'Cancelar sua assinatura? Você manterá o acesso até o final do período.' },
  'confirm.deleteAccount': { en: 'Delete your account permanently? ALL your notes, transcriptions and data will be deleted across all platforms. This is irreversible.', es: '¿Eliminar tu cuenta permanentemente? Se borrarán TODAS tus notas, transcripciones y datos en todas las plataformas. Esta acción es irreversible.', it: 'Eliminare il tuo account permanentemente? TUTTE le note, trascrizioni e dati verranno eliminati su tutte le piattaforme. Questa azione è irreversibile.', fr: 'Supprimer votre compte définitivement ? TOUTES vos notes, transcriptions et données seront supprimées sur toutes les plateformes. Cette action est irréversible.', pt: 'Excluir sua conta permanentemente? TODAS as notas, transcrições e dados serão excluídos em todas as plataformas. Esta ação é irreversível.' },
  'confirm.deleteNotes': { en: 'Delete {n} notes?', es: '¿Eliminar {n} notas?', it: 'Eliminare {n} note?', fr: 'Supprimer {n} notes ?', pt: 'Excluir {n} notas?' },

  // ── Modes ────────────────────────────────────────────────────────────
  'mode.summary': { en: 'Summary', es: 'Resumen', it: 'Riassunto', fr: 'Résumé', pt: 'Resumo' },
  'mode.tasks': { en: 'Tasks', es: 'Tareas', it: 'Attività', fr: 'Tâches', pt: 'Tarefas' },
  'mode.actionPlan': { en: 'Action plan', es: 'Plan de acción', it: "Piano d'azione", fr: "Plan d'action", pt: 'Plano de ação' },
  'mode.cleanText': { en: 'Clean text', es: 'Texto limpio', it: 'Testo pulito', fr: 'Texte nettoyé', pt: 'Texto limpo' },
  'mode.execReport': { en: 'Executive report', es: 'Reporte ejecutivo', it: 'Report esecutivo', fr: 'Rapport exécutif', pt: 'Relatório executivo' },
  'mode.readyMsg': { en: 'Ready message', es: 'Mensaje listo', it: 'Messaggio pronto', fr: 'Message prêt', pt: 'Mensagem pronta' },
  'mode.study': { en: 'Study', es: 'Estudio', it: 'Studio', fr: 'Étude', pt: 'Estudo' },
  'mode.ideas': { en: 'Ideas', es: 'Ideas', it: 'Idee', fr: 'Idées', pt: 'Ideias' },
  'mode.outline': { en: 'Outline', es: 'Outline', it: 'Schema', fr: 'Plan', pt: 'Esquema' },

  // ── Mode Results ─────────────────────────────────────────────────────
  'modeResult.keyPoints': { en: 'Key points', es: 'Puntos clave', it: 'Punti chiave', fr: 'Points clés', pt: 'Pontos-chave' },
  'modeResult.objective': { en: 'Objective', es: 'Objetivo', it: 'Obiettivo', fr: 'Objectif', pt: 'Objetivo' },
  'modeResult.steps': { en: 'Steps', es: 'Pasos', it: 'Passaggi', fr: 'Étapes', pt: 'Passos' },
  'modeResult.execSummary': { en: 'Executive summary', es: 'Resumen ejecutivo', it: 'Riassunto esecutivo', fr: 'Résumé exécutif', pt: 'Resumo executivo' },
  'modeResult.nextSteps': { en: 'Next steps', es: 'Próximos pasos', it: 'Prossimi passi', fr: 'Prochaines étapes', pt: 'Próximos passos' },
  'modeResult.readyMsgs': { en: 'Ready messages', es: 'Mensajes listos', it: 'Messaggi pronti', fr: 'Messages prêts', pt: 'Mensagens prontas' },
  'modeResult.professional': { en: 'Professional', es: 'Profesional', it: 'Professionale', fr: 'Professionnel', pt: 'Profissional' },
  'modeResult.friendly': { en: 'Friendly', es: 'Amigable', it: 'Amichevole', fr: 'Amical', pt: 'Amigável' },
  'modeResult.firm': { en: 'Firm', es: 'Firme', it: 'Deciso', fr: 'Ferme', pt: 'Firme' },
  'modeResult.brief': { en: 'Brief', es: 'Breve', it: 'Breve', fr: 'Bref', pt: 'Breve' },
  'modeResult.keyConcepts': { en: 'Key concepts', es: 'Conceptos clave', it: 'Concetti chiave', fr: 'Concepts clés', pt: 'Conceitos-chave' },
  'modeResult.probableQ': { en: 'Probable questions', es: 'Preguntas probables', it: 'Domande probabili', fr: 'Questions probables', pt: 'Perguntas prováveis' },
  'modeResult.coreIdea': { en: 'Core idea', es: 'Idea central', it: 'Idea centrale', fr: 'Idée centrale', pt: 'Ideia central' },
  'modeResult.opportunities': { en: 'Opportunities', es: 'Oportunidades', it: 'Opportunità', fr: 'Opportunités', pt: 'Oportunidades' },
  'modeResult.structured': { en: 'Structured version', es: 'Versión estructurada', it: 'Versione strutturata', fr: 'Version structurée', pt: 'Versão estruturada' },

  // ── Workspaces ───────────────────────────────────────────────────────
  'ws.title': { en: 'Workspaces', es: 'Workspaces', it: 'Workspaces', fr: 'Workspaces', pt: 'Workspaces' },
  'ws.subtitle': { en: 'Collaborate with your team on shared notes', es: 'Colabora con tu equipo en notas compartidas', it: 'Collabora con il tuo team sulle note condivise', fr: 'Collaborez avec votre équipe sur des notes partagées', pt: 'Colabore com sua equipe em notas compartilhadas' },
  'ws.create': { en: '+ Create workspace', es: '+ Crear workspace', it: '+ Crea workspace', fr: '+ Créer workspace', pt: '+ Criar workspace' },
  'ws.empty': { en: 'No workspaces', es: 'Sin workspaces', it: 'Nessun workspace', fr: 'Aucun workspace', pt: 'Sem workspaces' },
  'ws.emptyHint': { en: 'Create a workspace to organize your team.', es: 'Crea un workspace para organizar tu equipo.', it: 'Crea un workspace per organizzare il tuo team.', fr: 'Créez un workspace pour organiser votre équipe.', pt: 'Crie um workspace para organizar sua equipe.' },
  'ws.new': { en: 'New workspace', es: 'Nuevo workspace', it: 'Nuovo workspace', fr: 'Nouveau workspace', pt: 'Novo workspace' },
  'ws.name': { en: 'Workspace name', es: 'Nombre del workspace', it: 'Nome del workspace', fr: 'Nom du workspace', pt: 'Nome do workspace' },
  'ws.descOpt': { en: 'Description (optional)', es: 'Descripción (opcional)', it: 'Descrizione (opzionale)', fr: 'Description (optionnel)', pt: 'Descrição (opcional)' },

  // ── Settings ─────────────────────────────────────────────────────────
  'settings.title': { en: 'Settings', es: 'Configuracion', it: 'Impostazioni', fr: 'Paramètres', pt: 'Configurações' },
  'settings.subtitle': { en: 'Manage your account and subscription', es: 'Administra tu cuenta y suscripcion', it: 'Gestisci il tuo account e abbonamento', fr: 'Gérez votre compte et abonnement', pt: 'Gerencie sua conta e assinatura' },
  'settings.profile': { en: 'Profile', es: 'Perfil', it: 'Profilo', fr: 'Profil', pt: 'Perfil' },
  'settings.subscription': { en: 'Subscription', es: 'Suscripcion', it: 'Abbonamento', fr: 'Abonnement', pt: 'Assinatura' },
  'settings.security': { en: 'Security', es: 'Seguridad', it: 'Sicurezza', fr: 'Sécurité', pt: 'Segurança' },
  'settings.profileInfo': { en: 'Profile information', es: 'Informacion del perfil', it: 'Informazioni profilo', fr: 'Informations du profil', pt: 'Informações do perfil' },
  'settings.name': { en: 'Name', es: 'Nombre', it: 'Nome', fr: 'Nom', pt: 'Nome' },
  'settings.saving': { en: 'Saving...', es: 'Guardando...', it: 'Salvando...', fr: 'Enregistrement...', pt: 'Salvando...' },
  'settings.saveChanges': { en: 'Save changes', es: 'Guardar cambios', it: 'Salva modifiche', fr: 'Enregistrer', pt: 'Salvar alterações' },
  'settings.platforms': { en: 'Connected platforms', es: 'Plataformas conectadas', it: 'Piattaforme connesse', fr: 'Plateformes connectées', pt: 'Plataformas conectadas' },
  'settings.platformsSync': { en: 'Your account is active on these platforms. Notes sync automatically.', es: 'Tu cuenta esta activa en estas plataformas. Tus notas se sincronizan automaticamente.', it: 'Il tuo account è attivo su queste piattaforme. Le note si sincronizzano automaticamente.', fr: 'Votre compte est actif sur ces plateformes. Les notes se synchronisent automatiquement.', pt: 'Sua conta está ativa nessas plataformas. Notas sincronizam automaticamente.' },
  'settings.currentPlan': { en: 'Current plan', es: 'Tu plan actual', it: 'Piano attuale', fr: 'Plan actuel', pt: 'Plano atual' },
  'settings.active': { en: 'Active', es: 'Activo', it: 'Attivo', fr: 'Actif', pt: 'Ativo' },
  'settings.trial': { en: 'Trial period', es: 'Periodo de prueba', it: 'Periodo di prova', fr: "Période d'essai", pt: 'Período de teste' },
  'settings.subscribedVia': { en: 'Subscribed via', es: 'Suscrito via', it: 'Abbonato via', fr: 'Abonné via', pt: 'Assinante via' },
  'settings.accessUntil': { en: 'Access until: ', es: 'Acceso hasta: ', it: 'Accesso fino a: ', fr: "Accès jusqu'au : ", pt: 'Acesso até: ' },
  'settings.nextRenewal': { en: 'Next renewal: ', es: 'Proxima renovacion: ', it: 'Prossimo rinnovo: ', fr: 'Prochain renouvellement : ', pt: 'Próxima renovação: ' },
  'settings.organization': { en: 'Organization', es: 'Organizacion', it: 'Organizzazione', fr: 'Organisation', pt: 'Organização' },
  'settings.upgrade': { en: 'Upgrade your plan', es: 'Mejorar tu plan', it: 'Migliora il tuo piano', fr: 'Améliorer votre plan', pt: 'Melhorar seu plano' },
  'settings.manageSub': { en: 'Manage subscription', es: 'Administrar suscripcion', it: 'Gestisci abbonamento', fr: "Gérer l'abonnement", pt: 'Gerenciar assinatura' },
  'settings.cancelSub': { en: 'Cancel subscription', es: 'Cancelar suscripcion', it: 'Cancella abbonamento', fr: "Annuler l'abonnement", pt: 'Cancelar assinatura' },
  'settings.cancelledNote': { en: 'Subscription cancelled — access until end of period', es: 'Suscripcion cancelada — acceso hasta el fin del periodo', it: 'Abbonamento cancellato — accesso fino a fine periodo', fr: 'Abonnement annulé — accès jusqu\'à la fin de la période', pt: 'Assinatura cancelada — acesso até o fim do período' },
  'settings.changePassword': { en: 'Change password', es: 'Cambiar contrasena', it: 'Cambia password', fr: 'Changer le mot de passe', pt: 'Alterar senha' },
  'settings.passwordHint': { en: 'We\'ll send you an email with a reset link. Works for web and mobile.', es: 'Te enviaremos un email con un link para restablecer tu contrasena. Funciona tanto para web como para la app movil.', it: "Ti invieremo un'email con un link per il reset. Funziona sia per web che per l'app.", fr: 'Nous vous enverrons un email avec un lien de réinitialisation. Fonctionne pour le web et le mobile.', pt: 'Enviaremos um email com um link de redefinição. Funciona para web e mobile.' },
  'settings.sendReset': { en: 'Send reset email', es: 'Enviar email de restablecimiento', it: 'Invia email di reset', fr: 'Envoyer email de réinitialisation', pt: 'Enviar email de redefinição' },
  'settings.activeSessions': { en: 'Active sessions', es: 'Sesiones activas', it: 'Sessioni attive', fr: 'Sessions actives', pt: 'Sessões ativas' },
  'settings.sessionsHint': { en: 'Platforms where your account is logged in:', es: 'Plataformas donde tu cuenta ha iniciado sesion:', it: 'Piattaforme dove il tuo account è connesso:', fr: 'Plateformes où votre compte est connecté :', pt: 'Plataformas onde sua conta está conectada:' },
  'settings.deleteAccount': { en: 'Delete account', es: 'Eliminar cuenta', it: 'Elimina account', fr: 'Supprimer le compte', pt: 'Excluir conta' },
  'settings.deleteHint': { en: 'This is permanent. All notes, transcriptions and data will be deleted across all platforms.', es: 'Esta accion es permanente. Se eliminaran todas tus notas, transcripciones y datos de la cuenta en todas las plataformas.', it: "Questa azione è permanente. Tutte le note, trascrizioni e dati verranno eliminati su tutte le piattaforme.", fr: 'Cette action est permanente. Toutes les notes, transcriptions et données seront supprimées sur toutes les plateformes.', pt: 'Esta ação é permanente. Todas as notas, transcrições e dados serão excluídos em todas as plataformas.' },
  'settings.deleteMyAccount': { en: 'Delete my account', es: 'Eliminar mi cuenta', it: 'Elimina il mio account', fr: 'Supprimer mon compte', pt: 'Excluir minha conta' },
  'settings.mostPopular': { en: 'Most popular', es: 'Mas popular', it: 'Più popolare', fr: 'Le plus populaire', pt: 'Mais popular' },
  'settings.customPrice': { en: 'Custom pricing', es: 'Precio a medida', it: 'Prezzo personalizzato', fr: 'Prix personnalisé', pt: 'Preço personalizado' },
  'settings.choose': { en: 'Choose', es: 'Elegir', it: 'Scegli', fr: 'Choisir', pt: 'Escolher' },

  // ── Integrations ─────────────────────────────────────────────────────
  'int.title': { en: 'Integrations', es: 'Integraciones', it: 'Integrazioni', fr: 'Intégrations', pt: 'Integrações' },
  'int.subtitle': { en: 'Connect Sythio with your tools', es: 'Conecta Sythio con tus herramientas', it: 'Connetti Sythio con i tuoi strumenti', fr: 'Connectez Sythio à vos outils', pt: 'Conecte Sythio com suas ferramentas' },
  'int.backHome': { en: '← Back to home', es: '← Volver al inicio', it: '← Torna alla home', fr: '← Retour', pt: '← Voltar ao início' },

  // ── Platform banner ──────────────────────────────────────────────────
  'platform.activeVia': { en: 'You have an active subscription via', es: 'Tienes una suscripcion activa via', it: 'Hai un abbonamento attivo via', fr: 'Vous avez un abonnement actif via', pt: 'Você tem uma assinatura ativa via' },
  'platform.manageFrom': { en: 'Your Premium plan is active. To manage your subscription, do it from your', es: 'Tu plan Pro esta activo. Para administrar tu suscripcion, hazlo desde tu', it: 'Il tuo piano Premium è attivo. Per gestire il tuo abbonamento, fallo dal tuo', fr: 'Votre plan Premium est actif. Pour gérer votre abonnement, faites-le depuis votre', pt: 'Seu plano Premium está ativo. Para gerenciar sua assinatura, faça isso do seu' },
};

// ── Context ─────────────────────────────────────────────────────────────────

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
});

export const useI18n = () => useContext(I18nContext);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('sythio-lang') as Lang | null;
    return saved && saved in LANG_LABELS ? saved : 'en';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('sythio-lang', l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    const entry = T[key];
    if (!entry) return fallback ?? key;
    return entry[lang] ?? entry.en ?? fallback ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}
