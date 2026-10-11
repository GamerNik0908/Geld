# ⚡ Rechnungsblitz – Rechnungs-Tool mit Abo-Modell

Eine fertige Web-App (SaaS): Nutzer erstellen sich ein Konto und schreiben Rechnungen als PDF.
**Gratis** gibt es 3 Rechnungen im Monat. Mit dem **Pro-Abo (4,99 €/Monat)** schalten sie
weitere Funktionen frei. Bezahlt wird über **Stripe**: Karte, Apple Pay, Google Pay, SEPA usw.

| | Gratis | Pro |
|---|---|---|
| Rechnungen pro Monat | 3 | unbegrenzt |
| PDF-Download | ✓ | ✓ |
| Ohne Wasserzeichen „Erstellt mit Rechnungsblitz“ | ✕ | ✓ |
| Eigenes Logo | ✕ | ✓ |
| CSV-Export für die Steuer | ✕ | ✓ |

Das Wasserzeichen auf den Gratis-Rechnungen ist gleichzeitig Werbung: Jeder Empfänger sieht den Namen.

Die Grenzen werden **auf dem Server** geprüft und lassen sich nicht im Browser umgehen.
Neue Pro-Funktionen trägst du im Objekt `PLANS` in `server.js` ein.

## Lokal starten

```bash
npm install
npm start          # → http://localhost:3000
npm test
```

Ohne Stripe-Key läuft die App im **Testmodus**: „Pro holen“ schaltet Pro sofort frei, ohne Zahlung.
So kannst du alles ausprobieren.

## Echte Zahlungen aktivieren (Stripe)

1. Konto bei [stripe.com](https://stripe.com) anlegen (kostenlos, Gebühr nur pro Zahlung, ca. 1,5 % + 0,25 €).
2. **Produkt anlegen**: „Rechnungsblitz Pro“ mit einem *wiederkehrenden* Preis von 4,99 €/Monat.
   Die Preis-ID (`price_...`) kopieren.
3. `.env.example` nach `.env` kopieren und ausfüllen: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `BASE_URL`.
4. **Webhook einrichten**, damit die App erfährt, wer bezahlt oder gekündigt hat:
   Dashboard → Entwickler → Webhooks → Endpunkt `https://deine-domain.de/api/stripe/webhook`
   mit den Events `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated` und `customer.subscription.deleted`.
   Das Signing-Secret kommt in `STRIPE_WEBHOOK_SECRET`.
   Lokal geht das mit `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
5. **Kundenportal aktivieren** (Einstellungen → Billing → Kundenportal). Darüber kündigen Kunden
   selbst; in Deutschland ist ein Kündigungsbutton Pflicht.

Erst mit Test-Keys (`sk_test_...`) und der Testkarte `4242 4242 4242 4242` ausprobieren,
dann auf Live-Keys umstellen.

## Online stellen

Jeder Node.js-Hoster funktioniert, z. B. Railway, Render, Fly.io oder ein VPS (Hetzner ab ca. 4 €/Monat).
Wichtig: Die Datenbank `data.db` muss auf einem **dauerhaften Speicher** liegen
(Volume / persistent disk), sonst gehen die Daten bei jedem Neustart verloren.
Variable `DB_PATH` auf diesen Pfad setzen. Voraussetzung: Node.js ≥ 22.13.

## Bevor du Geld nimmst (Deutschland)

- **Gewerbe anmelden.** Für ein kostenpflichtiges Abo brauchst du das. Unter 18 nur mit Zustimmung der Eltern und des Familiengerichts.
- **Impressum, Datenschutzerklärung, AGB und Widerrufsbelehrung** in `public/impressum.html` ergänzen
  (Generatoren z. B. bei e-recht24.de).
- **Steuern:** Einnahmen beim Finanzamt angeben, eventuell die Kleinunternehmerregelung nutzen.

## Aufbau

```
server.js        API: Login, Rechnungen, Plan-Grenzen, Stripe-Checkout/Portal/Webhook
db.js            SQLite-Datenbank (eingebaut in Node, keine Installation nötig)
public/          Landingpage, Login, Dashboard, Rechnungsansicht
test/            automatische Tests (npm test)
```
