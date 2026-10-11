// Was jeder Plan darf. Neue Pro-Funktionen hier ergänzen.
const PLANS = {
  free: {
    name: "Starter",
    docsPerMonth: 3,
    maxCustomers: 5,
    maxProducts: 5,
    watermark: true,
    branding: false,
    qrCode: false,
    reminders: false,
    csvExport: false,
  },
  pro: {
    name: "Pro",
    docsPerMonth: Infinity,
    maxCustomers: Infinity,
    maxProducts: Infinity,
    watermark: false,
    branding: true,
    qrCode: true,
    reminders: true,
    csvExport: true,
  },
};

const TRIAL_DAYS = 14;

function effectivePlan(user) {
  if (user.plan === "pro") return "pro";
  if (user.trial_ends_at && user.trial_ends_at > Date.now()) return "pro";
  return "free";
}

function limitsFor(user) {
  return PLANS[effectivePlan(user)];
}

// Infinity übersteht JSON nicht, daher null = unbegrenzt.
function serializeLimits(limits) {
  return Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v === Infinity ? null : v]));
}

module.exports = { PLANS, TRIAL_DAYS, effectivePlan, limitsFor, serializeLimits };

// Angezeigte Preise (müssen zu den Preisen in Stripe passen).
const PRICES = { monthly: 6.99, yearly: 59 };
module.exports.PRICES = PRICES;
