// Fake/hardcoded seed data for the NSS Demo widget (nss-demo).
// No live API calls, no fetch, no persistence — everything here is a static
// fixture used to seed React state in NssDemoWidget.jsx (Global Constraints).

export const SEED_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'IT Breaking News',
    category: 'News',
    description: 'Notizie di attualità italiana in tempo reale, dalla politica alla cronaca.',
    matchedItemCount: 847,
    lastSaved: '2026-06-28T09:12:00Z',
    volumeByDay: [
      { day: 'Lun', count: 118 },
      { day: 'Mar', count: 132 },
      { day: 'Mer', count: 96 },
      { day: 'Gio', count: 145 },
      { day: 'Ven', count: 160 },
      { day: 'Sab', count: 88 },
      { day: 'Dom', count: 108 },
    ],
    recentMatches: [
      { headline: 'Governo approva manovra correttiva da 4 miliardi', timeAgo: '12 min fa', isUrgent: true },
      { headline: 'Senato vota fiducia al Ministro dell’Interno', timeAgo: '48 min fa', isUrgent: false },
      { headline: 'Sciopero nazionale dei trasporti: previsti disagi giovedì', timeAgo: '2 ore fa', isUrgent: false },
      { headline: 'Allerta meteo arancione su tre regioni del Nord', timeAgo: '3 ore fa', isUrgent: true },
    ],
    rules: {
      mode: 'ALL',
      groups: [
        {
          type: 'INCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Sezione', matchType: 'is', values: ['Politica', 'Cronaca'] },
            { family: 'Tag', matchType: 'contains', values: ['breaking', 'urgente'] },
          ],
        },
        {
          type: 'ESCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Tag', matchType: 'contains', values: ['sponsorizzato'] },
          ],
        },
      ],
    },
  },
  {
    id: 'prod-2',
    name: 'Finance Daily',
    category: 'Finance',
    description: 'Mercati, borsa e macroeconomia: la rassegna finanziaria quotidiana.',
    matchedItemCount: 312,
    lastSaved: '2026-06-29T07:45:00Z',
    volumeByDay: [
      { day: 'Lun', count: 41 },
      { day: 'Mar', count: 47 },
      { day: 'Mer', count: 39 },
      { day: 'Gio', count: 52 },
      { day: 'Ven', count: 58 },
      { day: 'Sab', count: 22 },
      { day: 'Dom', count: 18 },
    ],
    recentMatches: [
      { headline: 'Piazza Affari chiude in rialzo dello 0,8%', timeAgo: '25 min fa', isUrgent: false },
      { headline: 'BCE lascia invariati i tassi di interesse', timeAgo: '1 ora fa', isUrgent: true },
      { headline: 'Spread BTP-Bund scende sotto quota 120', timeAgo: '4 ore fa', isUrgent: false },
    ],
    rules: {
      mode: 'ALL',
      groups: [
        {
          type: 'INCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Sezione', matchType: 'is', values: ['Finanza', 'Economia'] },
          ],
        },
      ],
    },
  },
  {
    id: 'prod-3',
    name: 'Politics Highlights',
    category: 'Politics',
    description: 'I momenti chiave della politica italiana ed europea.',
    matchedItemCount: 312,
    lastSaved: '2026-06-27T18:20:00Z',
    volumeByDay: [
      { day: 'Lun', count: 40 },
      { day: 'Mar', count: 44 },
      { day: 'Mer', count: 51 },
      { day: 'Gio', count: 38 },
      { day: 'Ven', count: 49 },
      { day: 'Sab', count: 30 },
      { day: 'Dom', count: 60 },
    ],
    recentMatches: [
      { headline: 'Vertice europeo: raggiunto accordo sul patto migratorio', timeAgo: '38 min fa', isUrgent: false },
      { headline: 'Opposizione presenta mozione di sfiducia', timeAgo: '2 ore fa', isUrgent: true },
      { headline: 'Regionali, definiti i capilista nelle liste principali', timeAgo: '5 ore fa', isUrgent: false },
    ],
    rules: {
      mode: 'ANY',
      groups: [
        {
          type: 'INCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Sezione', matchType: 'is', values: ['Politica'] },
            { family: 'Tag', matchType: 'contains', values: ['governo', 'parlamento'] },
          ],
        },
      ],
    },
  },
  {
    id: 'prod-4',
    name: 'Sport — Serie A',
    category: 'Sport',
    description: 'Risultati, formazioni e retroscena del campionato di Serie A.',
    matchedItemCount: 1203,
    lastSaved: '2026-06-30T21:05:00Z',
    volumeByDay: [
      { day: 'Lun', count: 210 },
      { day: 'Mar', count: 140 },
      { day: 'Mer', count: 155 },
      { day: 'Gio', count: 160 },
      { day: 'Ven', count: 190 },
      { day: 'Sab', count: 240 },
      { day: 'Dom', count: 260 },
    ],
    recentMatches: [
      { headline: 'Inter batte il Milan nel derby e vola in vetta', timeAgo: '15 min fa', isUrgent: true },
      { headline: 'Juventus, infortunio muscolare per il centrocampista titolare', timeAgo: '1 ora fa', isUrgent: false },
      { headline: 'Napoli, il tecnico: "Vogliamo lottare per lo scudetto"', timeAgo: '3 ore fa', isUrgent: false },
      { headline: 'Calciomercato: la Roma vicina a chiudere per l’attaccante brasiliano', timeAgo: '6 ore fa', isUrgent: false },
    ],
    rules: {
      mode: 'ALL',
      groups: [
        {
          type: 'INCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Sezione', matchType: 'is', values: ['Sport'] },
            { family: 'Tag', matchType: 'contains', values: ['Serie A', 'calcio'] },
          ],
        },
        {
          type: 'ESCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Tag', matchType: 'contains', values: ['fantacalcio'] },
          ],
        },
      ],
    },
  },
  {
    id: 'prod-5',
    name: 'Tech & Innovation',
    category: 'Tech',
    description: 'Innovazione, startup e tecnologia made in Italy e non solo.',
    matchedItemCount: 229,
    lastSaved: '2026-06-26T11:30:00Z',
    volumeByDay: [
      { day: 'Lun', count: 28 },
      { day: 'Mar', count: 33 },
      { day: 'Mer', count: 30 },
      { day: 'Gio', count: 36 },
      { day: 'Ven', count: 41 },
      { day: 'Sab', count: 19 },
      { day: 'Dom', count: 22 },
    ],
    recentMatches: [
      { headline: 'Startup italiana lancia un’app di intelligenza artificiale per la sanità', timeAgo: '55 min fa', isUrgent: false },
      { headline: 'Il Garante Privacy apre un’istruttoria su un chatbot IA', timeAgo: '3 ore fa', isUrgent: true },
      { headline: 'Investimenti record nel settore delle rinnovabili digitali', timeAgo: '7 ore fa', isUrgent: false },
    ],
    rules: {
      mode: 'ALL',
      groups: [
        {
          type: 'INCLUDI',
          operator: 'OR',
          conditions: [
            { family: 'Sezione', matchType: 'is', values: ['Tecnologia'] },
            { family: 'Tag', matchType: 'contains', values: ['startup', 'intelligenza artificiale'] },
          ],
        },
      ],
    },
  },
];

export const SEED_PACKAGES = [
  {
    id: 'pkg-1',
    name: 'Enterprise News Pack',
    level: 'Enterprise',
    description: 'Il pacchetto più completo: news, finanza e politica in un unico flusso.',
    updateFrequency: 'Tempo reale',
    isActive: true,
    productIds: ['prod-1', 'prod-2', 'prod-3'],
    sortOrder: 'Più recenti prima',
    maxItemsPerResponse: 200,
    contentAgeLimitDays: 'Ultimi 7 giorni',
    assignedClientIds: ['client-1'],
  },
  {
    id: 'pkg-2',
    name: 'Italia Flash · Breaking News',
    level: 'Standard',
    description: 'Il flusso essenziale delle notizie italiane più urgenti.',
    updateFrequency: 'Ogni 5 minuti',
    isActive: true,
    productIds: ['prod-1'],
    sortOrder: 'Punteggio urgenza',
    maxItemsPerResponse: 100,
    contentAgeLimitDays: 'Nessun limite',
    assignedClientIds: [],
  },
  {
    id: 'pkg-3',
    name: 'Sport Nazionale Premium',
    level: 'Premium',
    description: 'Tutta la Serie A: risultati, formazioni e mercato in esclusiva.',
    updateFrequency: 'Ogni 15 minuti',
    isActive: true,
    productIds: ['prod-4'],
    sortOrder: 'Data pubblicazione',
    maxItemsPerResponse: 150,
    contentAgeLimitDays: 'Ultimi 30 giorni',
    assignedClientIds: [],
  },
];

export const SEED_CLIENTS = [
  {
    id: 'client-1',
    name: 'Meridiano News Srl',
    organization: 'Meridiano Media Group',
    email: 'tech@meridiano.it',
    type: 'Editore',
    isActive: true,
    notes: 'Cliente storico, integrazione SFTP push in produzione dal 2024.',
    packageIds: ['pkg-1'],
    channels: [
      {
        id: 'sftp-meridiano-push',
        name: 'SFTP Meridiano Push',
        type: 'SFTP',
        mode: 'Push',
        status: 'Attivo',
        includedPackageIds: ['pkg-1'],
      },
    ],
  },
  {
    id: 'client-2',
    name: 'Agenzia Stampa Nordest',
    organization: 'Nordest Agency Group',
    email: 'redazione@nordestagency.it',
    type: 'Agenzia',
    isActive: true,
    notes: 'Richiede consegna via WhatsApp per gli aggiornamenti flash.',
    packageIds: ['pkg-2'],
    channels: [
      {
        id: 'whatsapp-nordest-flash',
        name: 'WhatsApp Flash Nordest',
        type: 'WhatsApp',
        mode: 'Push',
        status: 'Attivo',
        includedPackageIds: ['pkg-2'],
      },
    ],
  },
  {
    id: 'client-3',
    name: 'Radio Diffusione Adriatica',
    organization: 'RDA Broadcast S.p.A.',
    email: 'it@rdabroadcast.it',
    type: 'Broadcast',
    isActive: false,
    notes: 'Contratto in pausa in attesa di rinnovo commerciale.',
    packageIds: ['pkg-3'],
    channels: [
      {
        id: 'http-rda-pull',
        name: 'HTTP RDA Pull',
        type: 'HTTP',
        mode: 'Pull',
        status: 'In pausa',
        includedPackageIds: ['pkg-3'],
      },
    ],
  },
];

export const SEED_DASHBOARD = {
  deliveries: [
    { packageName: 'Politica Daily', clientName: 'Il Sole 24 Ore', channel: 'SFTP', lastDeliveryTime: '09:14 · 2h fa', itemCount: 247, status: 'Errore' },
    { packageName: 'Sport Wire', clientName: 'ANSA Sport', channel: 'HTTP', lastDeliveryTime: '08:52 · 3h fa', itemCount: 89, status: 'Errore' },
    { packageName: 'Economics Bundle', clientName: 'Reuters Italia', channel: 'SFTP', lastDeliveryTime: '11:00 · adesso', itemCount: 512, status: 'OK' },
    { packageName: 'Breaking News RSS', clientName: 'Sky TG24', channel: 'RSS', lastDeliveryTime: '11:02 · adesso', itemCount: 34, status: 'OK' },
    { packageName: 'Italy Digest', clientName: 'AP Italia', channel: 'HTTP', lastDeliveryTime: '10:45 · 19 min fa', itemCount: 178, status: 'Parziale' },
    { packageName: 'WhatsApp Flash', clientName: 'Internal (ADN)', channel: 'WhatsApp', lastDeliveryTime: '10:30 · 34 min fa', itemCount: 12, status: 'OK' },
    { packageName: 'Finance Wire', clientName: 'Bloomberg Italia', channel: 'HTTP', lastDeliveryTime: '11:04 · adesso', itemCount: 423, status: 'OK' },
    { packageName: 'Politica Daily', clientName: 'Corriere della Sera', channel: 'SFTP', lastDeliveryTime: '09:00 · 2h fa', itemCount: 198, status: 'In Pausa' },
  ],
  errors: [
    { packageName: 'Politica Daily', clientName: 'Il Sole 24 Ore', message: 'Connessione SFTP rifiutata — host sftp.ilsole.it non raggiungibile sulla porta 22', timestamp: '09:14 CET' },
    { packageName: 'Sport Wire', clientName: 'ANSA Sport', message: 'HTTP 401 Non autorizzato', timestamp: '08:52 CET' },
    { packageName: 'Economics Bundle', clientName: 'Reuters Italia', message: 'Permesso S3 negato', timestamp: '07:40 CET' },
  ],
  channelBreakdown: [
    { channelType: 'SFTP', count: 1012, percentage: 55 },
    { channelType: 'HTTP', count: 690, percentage: 38 },
    { channelType: 'RSS', count: 128, percentage: 8 },
    { channelType: 'WhatsApp', count: 12, percentage: 1 },
  ],
};
