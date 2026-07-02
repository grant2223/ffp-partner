/* FFP Constants - v2 (2026-06-11)
   v2: pricing truth — Passport is a SUBSCRIPTION ($20/mo · $149/yr · 7-day trial), not a one-time $99.
       membershipUsd now = 149 (annual headline). Referral reward is RECURRING (tier% of each payment, per
       Stripe invoice) — the old "one-time % of $99" is dead. Display copy in the member dashboard updated to match.
   v1 (2026-05-31)
   SINGLE SOURCE OF TRUTH for cross-platform taxonomy + config. Load this BEFORE any
   dashboard logic so forms and calculations read window.FFP_CONST instead of each file
   keeping its own (drifting) copy.

   Money is USD member-facing (membership, referral earnings, payouts). Provider billing
   is AED elsewhere; FX below converts when needed. Referral reward = pct of membership.
*/
(function () {
  'use strict';
  window.FFP_CONST = {
    currency: 'USD',
    membershipUsd: 149,       // headline ANNUAL price (USD). Passport is a SUBSCRIPTION: $20/mo or $149/yr (7-day trial).
    minPayoutUsd: 250,        // minimum balance to request a payout
    // Referral reward is RECURRING: the referrer earns their tier% of EACH actual payment the referred member makes,
    // credited per Stripe invoice server-side (backend creditReferralForInvoice). NOT a one-time % of any single price.
    referralPct: { member: 5, supporter: 10, ambassador: 20 }, // % of each payment, per tier (recurring)
    fxAed: 3.6725,            // 1 USD -> AED (provider billing / conversions)

    // Canonical PROVIDER BUSINESS categories — used in apply + provider profile + admin.
    // (Activity/sport types for events/experiences are a separate list — not this one.)
    providerCategories: [
      'Fitness',
      'Wellness',
      'Padel',
      'Yoga & Pilates',
      'Climbing',
      'Combat sports',
      'Recovery',
      'Adventure',
      'Nutrition',
      'Coaching',
      'Retail',
      'Other'
    ]
  };

  // Helper: USD referral reward for a tier
  window.FFP_CONST.referralUsd = function (tier) {
    var pct = (window.FFP_CONST.referralPct[tier] || 0);
    return Math.round(window.FFP_CONST.membershipUsd * pct / 100 * 100) / 100;
  };
})();
