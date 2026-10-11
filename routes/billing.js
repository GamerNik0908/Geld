const express = require("express");
const db = require("../db");
const { requireUser } = require("../lib/auth");

// Stripe-Abo: Checkout, Kundenportal und Webhook. Ohne STRIPE_SECRET_KEY läuft
// ein Testmodus, in dem "Upgrade" Pro sofort ohne Zahlung freischaltet.
module.exports = function billingRoutes({ stripe, baseUrl }) {
  const router = express.Router();

  function setPlanBySubscription(sub) {
    const active = ["active", "trialing", "past_due"].includes(sub.status);
    db.prepare("UPDATE users SET plan = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?")
      .run(active ? "pro" : "free", sub.id, sub.customer);
  }

  // Muss vor express.json() eingebunden werden (Signaturprüfung braucht den Roh-Body).
  router.webhook = [
    express.raw({ type: "application/json" }),
    (req, res) => {
      if (!stripe) return res.status(404).end();
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        return res.status(400).send(`Webhook-Fehler: ${err.message}`);
      }
      const obj = event.data.object;
      if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
        db.prepare("UPDATE users SET plan = 'pro', stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?")
          .run(obj.customer, obj.subscription, Number(obj.client_reference_id));
      } else if (event.type.startsWith("customer.subscription.")) {
        setPlanBySubscription(obj);
      }
      res.json({ received: true });
    },
  ];

  router.post("/checkout", requireUser, async (req, res) => {
    const yearly = req.body.interval === "year";
    if (!stripe) {
      db.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").run(req.user.id);
      return res.json({ url: "/app#/abo?upgraded=1" });
    }
    const price = yearly ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
    if (!price) return res.status(500).json({ error: "Preis ist nicht konfiguriert (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY)." });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: String(req.user.id),
      ...(req.user.stripe_customer_id ? { customer: req.user.stripe_customer_id } : { customer_email: req.user.email }),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      locale: "de",
      success_url: `${baseUrl}/app#/abo?upgraded=1`,
      cancel_url: `${baseUrl}/app#/abo`,
    });
    res.json({ url: session.url });
  });

  router.post("/portal", requireUser, async (req, res) => {
    if (!stripe) {
      db.prepare("UPDATE users SET plan = 'free', trial_ends_at = NULL WHERE id = ?").run(req.user.id);
      return res.json({ url: "/app#/abo" });
    }
    if (!req.user.stripe_customer_id) return res.status(400).json({ error: "Es ist noch kein Abo vorhanden." });
    const portal = await stripe.billingPortal.sessions.create({ customer: req.user.stripe_customer_id, return_url: `${baseUrl}/app#/abo` });
    res.json({ url: portal.url });
  });

  return router;
};
