/* Purse Zero smart coach: free advice worked out on your phone from your own numbers.
   No AI service, no key, no cost, and nothing leaves the app. Used whenever the online
   AI chat isn't set up (or you're offline). */
(function () {
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const rs = v => inr.format(Math.round(v || 0));
  const num = v => (typeof v === "number" && isFinite(v) ? v : null);

  function readData(prompt) {
    const m = String(prompt).match(/DATA:\s*\n(\{.*\})\s*\n/);
    try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; }
  }
  const isRotate = l => /reuses/.test(l.usage || "");
  const daysUntil = d => Math.round((new Date(d + "T00:00") - new Date(new Date().toDateString())) / 864e5);

  function analyse(D) {
    const loans = (D.loans || []).filter(l => !isRotate(l));
    const knownLoans = loans.filter(l => num(l.outstanding) !== null && l.outstanding > 0);
    const salary = D.salary || 0;
    const emis = (D.loans || []).reduce((s, l) => s + (l.monthly_payment || 0), 0);
    const yearly = l => l.outstanding * (l.interest_pct || 0) / 100;
    const order = knownLoans.filter(l => (l.interest_pct || 0) > 0)
      .sort((a, b) => ((a.type === "Home loan") - (b.type === "Home loan")) || (b.interest_pct - a.interest_pct) || (a.outstanding - b.outstanding));
    return { loans, knownLoans, salary, emis, yearly, order };
  }

  /* ---------- "Review my money" ---------- */
  function review(D) {
    const A = analyse(D), moves = [];
    const tm = D.this_month || [];
    const overdue = tm.filter(r => r.status === "overdue");
    if (overdue.length) moves.push({ title: `Pay ${overdue.length} overdue payment${overdue.length > 1 ? "s" : ""} first`, why: `${overdue.slice(0, 4).map(r => `${r.name} ${rs(r.amount)}`).join(", ")}${overdue.length > 4 ? "…" : ""}. Late fees and penalty interest start immediately, and missed EMIs hurt your credit score.`, saves_inr: 0 });

    (D.loans || []).filter(l => l.renew_by).forEach(l => {
      const d = daysUntil(l.renew_by);
      if (d <= 30) moves.push({ title: `${d < 0 ? "Renew now" : "Renew or release"}: gold at ${l.lender || l.name}`, why: `${d < 0 ? `The renewal date passed ${-d} days ago.` : `Due in ${d} days.`} A missed gold‑loan renewal can lead to auction of ${l.jewels || "your jewels"}. Pay the interest and renew, or release it if you have the cash.`, saves_inr: 0 });
    });

    if (D.spare_for_debt < 0) {
      const big = (D.loans || []).concat(D.monthly_payments || []).map(x => ({ n: x.name, a: x.monthly_payment || x.amount || 0 })).sort((a, b) => b.a - a.a).slice(0, 3);
      moves.push({ title: `Close the ${rs(-D.spare_for_debt)} monthly gap`, why: `Your payments, living money and savings are more than your salary. The biggest outgoings are ${big.map(b => `${b.n} ${rs(b.a)}`).join(", ")}. Options: pause savings, trim living money, ask the costliest lender for a longer tenure, or settle a hand loan for a lower fixed amount.`, saves_inr: 0 });
    }

    const first = A.order[0];
    if (first) moves.push({ title: `Put every spare rupee into ${first.name}`, why: `At ${first.interest_pct}% it's your costliest debt (${rs(first.outstanding)} left, about ${rs(A.yearly(first))} interest a year). Pay its ${first.type === "Credit card" ? "due" : "EMI"} plus anything extra here until it's closed, then roll that whole amount into ${A.order[1] ? A.order[1].name : "the next loan"}.`, saves_inr: A.yearly(first) });

    const cards = A.knownLoans.filter(l => l.type === "Credit card" && (l.interest_pct || 0) > 0);
    cards.filter(c => c !== first).forEach(c => moves.push({ title: `Pay more than the minimum on ${c.name}`, why: `The minimum due mostly covers interest at ${c.interest_pct}%. Paying ${rs(Math.max(c.monthly_payment * 3, c.outstanding / 6))} a month clears ${rs(c.outstanding)} in about 6 months. Stop new spends on this card meanwhile.`, saves_inr: A.yearly(c) }));

    (D.loans || []).filter(isRotate).forEach(c => moves.push({ title: `Slowly stop reusing ${c.name}`, why: `You pay ${rs(c.monthly_payment)} and spend it again every month, so that money is borrowed each month. Spend ₹2,000 less on the card each month and pay that part by UPI instead.`, saves_inr: 0 }));

    const apps = A.knownLoans.filter(l => l.type === "App loan" && l.interest_pct >= 20);
    if (apps.length > 1) moves.push({ title: "Close app loans before anything else", why: `${apps.map(a => `${a.name} ${a.interest_pct}%`).join(", ")}. Never take a new app loan to repay another one.`, saves_inr: apps.reduce((s, a) => s + A.yearly(a), 0) });

    const noCost = A.loans.filter(l => l.type === "Product EMI" && !(l.interest_pct > 0));
    if (noCost.length) moves.push({ title: `Let ${noCost.map(l => l.name).join(", ")} run`, why: "No‑cost EMIs charge no interest, so closing them early saves nothing. Use spare money on loans that charge interest.", saves_inr: 0 });

    const home = A.knownLoans.filter(l => l.type === "Home loan");
    if (home.length && A.order.length > home.length) moves.push({ title: "Prepay home loans last", why: `At ${home.map(h => h.interest_pct + "%").join(" / ")} they're your cheapest debt and may give tax benefit. Prepay only after the costlier loans are closed.`, saves_inr: 0 });

    if (A.salary && A.emis / A.salary > 0.5) moves.push({ title: "Don't take any new loan or card EMI", why: `EMIs and dues are ${Math.round(A.emis / A.salary * 100)}% of your salary (${rs(A.emis)}). Lenders treat above 40–50% as risky.`, saves_inr: 0 });

    if ((D.settle_plan || []).length && D.money_available_to_settle > 0) {
      const need = D.settle_plan.reduce((s, p) => s + p.settle_for, 0);
      moves.push({ title: "Use your settle money in this order", why: `${D.settle_plan.map(p => `${p.name} ${rs(p.settle_for)}`).join(", ")}. You have ${rs(D.money_available_to_settle)} of ${rs(need)} needed.`, saves_inr: 0 });
    }

    const P = D.plan || {};
    const headline = D.spare_for_debt < 0 ? `Short by ${rs(-D.spare_for_debt)} a month. Fix that first, then follow this order.` :
      P.debt_free_month_with_spare && P.debt_free_month_with_spare !== "never" ? `Debt‑free by ${P.debt_free_month_with_spare} if you follow this order and roll every closed EMI into the next loan.` :
      "Follow this order: costliest interest first, then roll each freed EMI into the next loan.";
    const fam = (D.monthly_payments || []).filter(m => m.type === "Family");
    const pend = tm.filter(r => r.status !== "paid");
    return {
      headline,
      moves: moves.slice(0, 6),
      this_month: `${fam.length ? `Send ${fam.map(f => f.name).join(" and ")} first. ` : ""}${pend.length} payments still pending (${rs(pend.reduce((s, r) => s + r.amount, 0))}). Tick them off as you pay.`
    };
  }

  /* ---------- "Ask the coach" ---------- */
  function ask(D, q) {
    const A = analyse(D), Q = q.toLowerCase();
    const lines = [];
    if (/close first|which loan|order/.test(Q)) {
      lines.push("Close in this order (costliest interest first, home loan last):");
      A.order.slice(0, 6).forEach((l, i) => lines.push(`${i + 1}. ${l.name}: ${l.interest_pct}%, ${rs(l.outstanding)} left, about ${rs(A.yearly(l))} interest a year`));
      lines.push("When one closes, add its EMI to the next one on the list.");
    } else if (/home loan/.test(Q)) {
      const h = A.knownLoans.filter(l => l.type === "Home loan");
      if (!h.length) lines.push("You don't have a home loan entered.");
      else {
        lines.push(`Your home loans: ${h.map(l => `${l.name} ${l.interest_pct}% (${rs(l.outstanding)})`).join(", ")}.`);
        const costlier = A.order.filter(l => l.type !== "Home loan" && l.interest_pct > Math.max(...h.map(x => x.interest_pct)));
        lines.push(costlier.length ? `Not yet. ${costlier.length} loan${costlier.length > 1 ? "s cost" : " costs"} more (${costlier.slice(0, 3).map(l => `${l.name} ${l.interest_pct}%`).join(", ")}). Clear those first, then prepay the home loan.` : "Yes, it's now your costliest loan. Prepay with lump sums and keep the EMI the same so the tenure shortens.");
        lines.push("Floating‑rate home loans usually have no prepayment charge. Ask the bank to reduce tenure, not EMI.");
      }
    } else if (/credit card|reus|card/.test(Q)) {
      const rot = (D.loans || []).filter(isRotate), cards = A.knownLoans.filter(l => l.type === "Credit card");
      if (rot.length) rot.forEach(c => lines.push(`${c.name}: you reuse about ${rs(c.monthly_payment)} a month. Cut card spending by ₹2,000 each month and pay those things by UPI. In about ${Math.ceil(c.monthly_payment / 2000)} months you'll stop borrowing from it.`));
      cards.forEach(c => lines.push(`${c.name}: ${rs(c.outstanding)} at ${c.interest_pct}%. Pay well above the minimum; the minimum mostly covers interest.`));
      if (!rot.length && !cards.length) lines.push("You have no card balances entered.");
      lines.push("Keep the card, but remove it from saved payments in shopping and food apps so you don't use it by habit.");
    } else if (/balance transfer|transfer/.test(Q)) {
      const cards = A.knownLoans.filter(l => l.type === "Credit card" && l.interest_pct > 20);
      lines.push("A balance transfer or card‑to‑EMI moves a 36–42% card balance to a lower rate, often 12–18%, for a processing fee of about 1–2% plus GST.");
      if (cards.length) lines.push(`For you: ${cards.map(c => `${c.name} ${rs(c.outstanding)}`).join(", ")}. Worth it if you also stop using the card; otherwise the balance comes back.`);
      lines.push("Compare the total of fee plus interest with what the card would charge, and pick the shortest tenure you can afford.");
    } else if (/gold|jewel/.test(Q)) {
      const g = A.knownLoans.filter(l => l.type === "Gold loan");
      if (!g.length) lines.push("You don't have a gold loan entered.");
      g.forEach(l => lines.push(`${l.name}: ${rs(l.outstanding)} at ${l.interest_pct}%${l.renew_by ? `, renew by ${l.renew_by}` : ""}.`));
      const costlier = A.order.filter(l => g.length && l.interest_pct > Math.max(...g.map(x => x.interest_pct)));
      if (g.length) lines.push(costlier.length ? `Gold loans are cheaper than ${costlier.slice(0, 3).map(l => l.name).join(", ")}. Pay those first, but never miss a gold renewal.` : "Gold is now among your costliest debts, so release it next when you have the cash.");
    } else if (/cut|save|spend|reduce/.test(Q)) {
      lines.push(`Your living money is ${rs(D.living_money)} a month and savings ${rs(D.savings_per_month)}.`);
      lines.push("Quick ways to free ₹5,000: one fewer food delivery a week (about ₹1,600), carry lunch 3 days (₹1,500), review OTT and app subscriptions (₹500–1,000), and a cheaper mobile or data plan (₹300–500).");
      if (A.order[0]) lines.push(`Send whatever you free up straight to ${A.order[0].name} (${A.order[0].interest_pct}%).`);
    } else {
      const r = review(D);
      lines.push(r.headline);
      r.moves.slice(0, 3).forEach(m => lines.push(`- ${m.title}: ${m.why}`));
      lines.push("", "For free‑text questions, turn on the free AI chat (see README, step 3).");
    }
    return lines.join("\n");
  }

  window.PZ_SMART_COACH = {
    reviewFromPrompt(prompt) { const D = readData(prompt); if (!D) throw { code: "error", message: "No data" }; return review(D); },
    askFromPrompt(prompt) { const D = readData(prompt); if (!D) throw { code: "error", message: "No data" }; const q = (String(prompt).match(/QUESTION:\s*(.*)/) || [])[1] || ""; return ask(D, q); }
  };
})();
