const path = require('path');
const fs = require('fs');
const gp = path.join(process.env.APPDATA, 'npm', 'node_modules', 'docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, Header, Footer, PageNumber, TabStopType, TabStopPosition,
} = require(gp);

const NAVY = "1F3864";
const BLUE = "2E75B6";
const LIGHT = "D9E2F3";
const GREY = "595959";

const border = { style: BorderStyle.SINGLE, size: 1, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

// helpers
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const P = (t, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text: t, ...(opts.run || {}) })] });
const bullet = (t) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 60 }, children: [new TextRun(t)] });

function headCell(t, w) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: "FFFFFF" })] })],
  });
}
function cell(t, w, opts = {}) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: [new TextRun({ text: t, bold: !!opts.bold, color: opts.color })] })],
  });
}

const CW = 9360;

// ---- Pricing table ----
const pricingTable = new Table({
  width: { size: CW, type: WidthType.DXA },
  columnWidths: [4360, 2200, 2800],
  rows: [
    new TableRow({ tableHeader: true, children: [headCell("Prestation", 4360), headCell("Nature", 2200), headCell("Montant (DH)", 2800)] }),
    new TableRow({ children: [cell("Licence d'utilisation perpétuelle", 4360), cell("Paiement unique", 2200), cell("100 000", 2800, { align: AlignmentType.RIGHT, bold: true })] }),
    new TableRow({ children: [cell("Installation, déploiement et mise en service (incluse)", 4360), cell("Paiement unique", 2200), cell("Incluse", 2800, { align: AlignmentType.RIGHT })] }),
    new TableRow({ children: [cell("Maintenance et support — 1ère année", 4360), cell("Annuel", 2200), cell("20 000", 2800, { align: AlignmentType.RIGHT, bold: true })] }),
    new TableRow({ children: [
      cell("TOTAL 1ère année", 4360, { fill: LIGHT, bold: true }),
      cell("", 2200, { fill: LIGHT }),
      cell("120 000", 2800, { fill: LIGHT, align: AlignmentType.RIGHT, bold: true }),
    ]}),
    new TableRow({ children: [
      cell("Maintenance annuelle (années suivantes)", 4360, { fill: "F2F2F2" }),
      cell("Annuel récurrent", 2200, { fill: "F2F2F2" }),
      cell("20 000", 2800, { fill: "F2F2F2", align: AlignmentType.RIGHT, bold: true }),
    ]}),
  ],
});

// ---- Maintenance scope table ----
function twoCol(rowsData) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      new TableRow({ tableHeader: true, children: [headCell("Inclus dans la maintenance", 4680), headCell("Hors maintenance (sur devis)", 4680)] }),
      ...rowsData.map(([a, b]) => new TableRow({ children: [cell(a, 4680), cell(b, 4680)] })),
    ],
  });
}
const maintTable = twoCol([
  ["Correctifs de bugs et de sécurité", "Développement de nouvelles fonctionnalités"],
  ["Mises à jour de la plateforme", "Modules supplémentaires non prévus au contrat"],
  ["Support technique à distance (jours ouvrables)", "Formation au-delà de la session initiale"],
  ["Supervision des sauvegardes automatiques", "Restauration suite à une erreur de l'établissement"],
  ["Assistance en cas d'incident serveur applicatif", "Achat / gestion du matériel serveur"],
]);

const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

const doc = new Document({
  creator: "EducTrack",
  title: "Proposition commerciale - Licence on-premise",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "262626" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, color: NAVY, font: "Arial" },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: BLUE, font: "Arial" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
  ]},
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF", space: 4 } },
      children: [
        new TextRun({ text: "EducTrack", bold: true, color: NAVY }),
        new TextRun({ text: "\tProposition commerciale", color: GREY, size: 18 }),
      ] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "EducTrack — etrack.ma   |   Confidentiel   |   Page ", size: 16, color: GREY }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
      ] })] }) },
    children: [
      // Title block
      new Paragraph({ spacing: { before: 600, after: 60 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "PROPOSITION COMMERCIALE", bold: true, size: 44, color: NAVY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
        children: [new TextRun({ text: "Licence d'utilisation & hébergement dédié (on-premise)", size: 26, color: BLUE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: "Plateforme de gestion scolaire EducTrack", size: 22, color: GREY, italics: true })] }),

      new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [3120, 6240],
        rows: [
          new TableRow({ children: [cell("Établissement", 3120, { fill: LIGHT, bold: true }), cell("[Nom de l'établissement]", 6240)] }),
          new TableRow({ children: [cell("À l'attention de", 3120, { fill: LIGHT, bold: true }), cell("[Nom du responsable / Direction]", 6240)] }),
          new TableRow({ children: [cell("Éditeur / Prestataire", 3120, { fill: LIGHT, bold: true }), cell("Zouhair Essaihi — EducTrack", 6240)] }),
          new TableRow({ children: [cell("Contact", 3120, { fill: LIGHT, bold: true }), cell("zouhairessaihi04@gmail.com", 6240)] }),
          new TableRow({ children: [cell("Date", 3120, { fill: LIGHT, bold: true }), cell(today, 6240)] }),
          new TableRow({ children: [cell("Validité de l'offre", 3120, { fill: LIGHT, bold: true }), cell("30 jours à compter de la date ci-dessus", 6240)] }),
        ],
      }),

      H1("1. Contexte"),
      P("Le présent document constitue une proposition commerciale pour l'acquisition d'une licence d'utilisation de la plateforme de gestion scolaire EducTrack, déployée et hébergée sur l'infrastructure propre de l'établissement (mode « on-premise »)."),
      P("Ce mode de déploiement répond à l'exigence de confidentialité de l'établissement : l'intégralité des données (élèves, familles, notes, finances) est hébergée et conservée sur le serveur de l'établissement, sous son contrôle exclusif."),

      H1("2. Périmètre fonctionnel"),
      P("La plateforme couvre l'ensemble de la gestion d'un établissement scolaire à travers les modules suivants :"),
      bullet("Gestion des élèves, classes, enseignants et matières"),
      bullet("Suivi des absences, retards et comportement"),
      bullet("Cahier de textes, devoirs, contrôles et plan de contrôles"),
      bullet("Bulletins de notes et examens de certification (national, régional, local)"),
      bullet("Module financier : facturation, paiements, caisse, dépenses et impayés"),
      bullet("Transport scolaire avec suivi cartographique en temps réel"),
      bullet("Vie scolaire : cahier de vie, signalements, sondages, objets perdus, parascolaire"),
      bullet("Communication automatisée avec les parents via WhatsApp (chatbot bilingue FR/AR)"),
      bullet("Espaces dédiés : administration, enseignants, élèves, parents"),
      bullet("Assistant IA intégré (voir clause de confidentialité, §4)"),

      H1("3. Modèle de déploiement on-premise"),
      P("La solution est livrée et installée sur le serveur de l'établissement. Elle comprend :"),
      bullet("Installation complète de l'application (interface web + serveur applicatif)"),
      bullet("Base de données auto-hébergée sur le serveur de l'établissement"),
      bullet("Configuration du nom de domaine, du certificat SSL et de la sécurité d'accès"),
      bullet("Mise en place des sauvegardes automatiques quotidiennes"),
      bullet("Création des comptes administrateurs initiaux et session de formation"),
      P("Prérequis : l'établissement met à disposition un serveur (physique ou virtuel) répondant aux spécifications techniques communiquées par l'éditeur, ainsi qu'un accès distant sécurisé pour la maintenance.", { run: { italics: true, color: GREY } }),

      H1("4. Confidentialité et protection des données"),
      bullet("Les données sont hébergées exclusivement sur le serveur de l'établissement."),
      bullet("L'éditeur n'accède aux données que dans le cadre des opérations de maintenance, à la demande de l'établissement."),
      bullet("Module IA : certaines fonctionnalités d'assistance s'appuient sur un service d'intelligence artificielle externe (OpenAI). Les données transmises sont minimisées et ne servent pas à l'entraînement de modèles tiers. L'établissement peut désactiver ce module à tout moment. Cette clause sera précisée et acceptée dans le contrat définitif."),
      bullet("Le traitement est conforme à la loi 09-08 relative à la protection des données à caractère personnel."),

      new Paragraph({ pageBreakBefore: true, ...{} , heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Offre tarifaire")] }),
      P("Les montants ci-dessous sont exprimés en dirhams marocains (DH), hors taxes."),
      pricingTable,
      new Paragraph({ spacing: { before: 160, after: 120 }, children: [
        new TextRun({ text: "La licence est perpétuelle : une fois acquise, le droit d'utilisation de la version livrée est définitif. ", bold: true }),
        new TextRun("Seule la maintenance annuelle est récurrente et donne accès au support et aux mises à jour."),
      ]}),

      H2("Modalités de paiement (proposées)"),
      bullet("50 % à la signature du contrat (60 000 DH)"),
      bullet("50 % à la livraison et mise en service (60 000 DH)"),
      bullet("Maintenance des années suivantes : facturée annuellement, à la date anniversaire"),

      H1("6. Détail de la maintenance et du support"),
      P("La maintenance annuelle (20 000 DH/an) couvre les prestations suivantes :"),
      maintTable,

      H1("7. Conditions générales"),
      bullet("La licence est concédée à l'établissement nommé et n'est pas cessible à un tiers."),
      bullet("Le code source reste la propriété intellectuelle exclusive de l'éditeur."),
      bullet("La maintenance est reconductible annuellement par accord des deux parties."),
      bullet("Les délais d'installation sont précisés au contrat après validation des prérequis serveur."),
      bullet("Tout développement spécifique non prévu dans le périmètre fait l'objet d'un devis distinct."),

      H1("8. Acceptation"),
      P("Pour accord sur la présente proposition, merci de retourner ce document daté, signé et revêtu du cachet de l'établissement.", { spacing: { after: 400 } }),

      new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [4680, 4680],
        rows: [ new TableRow({ children: [
          new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 120, bottom: 600, left: 140, right: 140 },
            children: [ new Paragraph({ children: [new TextRun({ text: "Pour l'établissement", bold: true })] }),
              new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Nom, qualité, date et cachet :", color: GREY, size: 18 })] }) ] }),
          new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 120, bottom: 600, left: 140, right: 140 },
            children: [ new Paragraph({ children: [new TextRun({ text: "Pour l'éditeur — EducTrack", bold: true })] }),
              new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Zouhair Essaihi", color: GREY, size: 18 })] }) ] }),
        ]}) ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(process.cwd(), "Proposition_Commerciale_EducTrack.docx");
  fs.writeFileSync(out, buf);
  console.log("OK ->", out);
});
