// ============================================================
//  HIER ANPASSEN – alles andere funktioniert automatisch.
// ============================================================
window.SHOP_CONFIG = {
  name: "Dein Name",
  slogan: "Ich helfe dir, Zeit zu sparen – schnell, zuverlässig, fair.",
  email: "deine@email.de",

  // Angebote / Produkte. "link" = Zahlungslink von Stripe, PayPal.me,
  // Gumroad, Ko-fi o. Ä. (siehe README). Ohne Link wird eine
  // Anfrage per E-Mail geöffnet.
  angebote: [
    {
      titel: "Canva-Vorlagenpaket",
      beschreibung: "30 Social-Media-Vorlagen für Instagram & TikTok, sofort als Download.",
      preis: "9 €",
      link: "",
      typ: "Digitales Produkt"
    },
    {
      titel: "Website in 48 Stunden",
      beschreibung: "Eine moderne One-Page-Website für dein Business, inkl. Einrichtung.",
      preis: "ab 149 €",
      link: "",
      typ: "Dienstleistung"
    },
    {
      titel: "Nachhilfe / Coaching (60 Min.)",
      beschreibung: "Online per Video-Call – Mathe, Englisch, Social Media oder PC-Hilfe.",
      preis: "25 €",
      link: "",
      typ: "Dienstleistung"
    }
  ],

  // Kundenstimmen (optional, nur echte verwenden!)
  stimmen: [
    // { text: "Super schnell und freundlich!", name: "Anna, Berlin" }
  ],

  // Daten für den Rechnungsgenerator (rechnung.html)
  rechnung: {
    adresse: "Musterstraße 1\n12345 Musterstadt",
    iban: "DE00 0000 0000 0000 0000 00",
    steuernummer: "",
    kleinunternehmer: true // §19 UStG: keine Umsatzsteuer ausweisen
  }
};
