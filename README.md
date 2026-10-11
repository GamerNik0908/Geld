# Geld – deine eigene Verkaufsseite + Rechnungsgenerator

Ein kostenloses Starter-Kit, um **eigene Produkte oder Dienstleistungen online zu verkaufen** –
ohne Programmierkenntnisse, ohne monatliche Kosten.

| Datei | Wofür |
|---|---|
| `index.html` | Verkaufsseite mit deinen Angeboten und „Jetzt kaufen“-Buttons |
| `rechnung.html` | Rechnungen erstellen und als PDF speichern |
| `impressum.html` | Vorlage für Impressum & Datenschutz (in DE Pflicht) |
| `config.js` | **Die einzige Datei, die du bearbeiten musst** |

## In 4 Schritten online

1. **`config.js` anpassen** – Name, E-Mail, deine Angebote und Preise eintragen.
2. **Zahlungslinks erstellen** (kostenlos, Gebühr nur pro Verkauf) und bei `link` eintragen:
   - [Stripe Payment Links](https://stripe.com/de/payments/payment-links) – Karte, Apple Pay, Klarna …
   - [PayPal.me](https://www.paypal.com/paypalme/) – z. B. `https://paypal.me/deinname/25`
   - [Gumroad](https://gumroad.com) / [Ko-fi](https://ko-fi.com) – ideal für digitale Downloads (liefern die Datei automatisch aus)
   - Ohne Link öffnet der Button einfach eine E-Mail-Anfrage.
3. **`impressum.html` mit echten Daten ausfüllen.**
4. **Kostenlos veröffentlichen mit GitHub Pages:** Repository → *Settings* → *Pages* →
   Branch auswählen → *Save*. Nach ~1 Minute ist die Seite unter
   `https://<dein-name>.github.io/Geld/` erreichbar.

## Ideen, womit du realistisch Geld verdienen kannst

- **Dienstleistungen** (schnellster Weg zum ersten Euro): Nachhilfe, PC-/Handy-Hilfe für Senioren,
  Social-Media-Betreuung für lokale Läden, Videoschnitt, Übersetzungen, Websites erstellen.
- **Digitale Produkte** (einmal erstellen, oft verkaufen): Canva-/Notion-Vorlagen, Lernzettel,
  Presets, E-Books, Checklisten.
- **Kunden finden:** Link in deine TikTok-/Instagram-Bio, lokale Geschäfte direkt ansprechen,
  Kleinanzeigen, Facebook-Gruppen, Schwarzes Brett.

## Wichtig (Deutschland)

- Wer regelmäßig verkauft, braucht in der Regel ein **Gewerbe** (Anmeldung beim Gewerbeamt, ca. 20–60 €)
  bzw. meldet eine freiberufliche Tätigkeit beim Finanzamt an.
- Mit der **Kleinunternehmerregelung (§ 19 UStG)** musst du keine Umsatzsteuer ausweisen
  (aktuelle Umsatzgrenzen beim Finanzamt prüfen). Im Rechnungsgenerator per
  `kleinunternehmer: true` eingestellt.
- **Unter 18?** Dann brauchst du für ein Gewerbe die Zustimmung der Eltern (und ggf. des Familiengerichts).
- Bei Unsicherheit: kurz beim Finanzamt oder einer Steuerberatung nachfragen.

Keine Software verdient von allein Geld – aber hiermit hast du in einer Stunde einen
professionellen Auftritt, über den Kunden direkt bei dir kaufen können.
