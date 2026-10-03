const PAYSTACK_PUBLIC_KEY = "pk_live_92a6fb3739637d334332b8e384529bcca58d2d35";
const CURRENCY = "GHS";
const MONTHLY_RATE = 20.5;
const MAX_MONTHS = 24;

/* ---------- Pure business logic ---------- */
const money = (n) => `${CURRENCY} ${n.toFixed(2)}`;
const toPesewas = (ghs) => Math.round(ghs * 100);
const duesTotal = (months) => Math.round(MONTHLY_RATE * months * 100) / 100;
const newReference = () => `TDP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const parseMonths = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const parseAmount = (v) => (/^\d+(\.\d{1,2})?$/.test(String(v).trim()) ? Number(v) : NaN);
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/* ---------- DOM helpers ---------- */
const $ = (id) => document.getElementById(id);
let busy = false; // single flag prevents duplicate transactions across both forms

function setError(id, message) {
  const input = $(id), err = $(`${id}-error`);
  err.textContent = message || "";
  input.setAttribute("aria-invalid", message ? "true" : "false");
  return !message;
}
function setStatus(prefix, text, kind = "info") {
  const el = $(`${prefix}-status`);
  el.textContent = text;
  el.className = `status ${text ? kind : ""}`;
}
function setLoading(button, loading, label) {
  button.disabled = loading;
  button.classList.toggle("loading", loading);
  button.querySelector(".cta-text").textContent = label;
}

/* ---------- Dues UI ---------- */
const monthsInput = $("dues-months"), duesBtn = $("dues-pay");
const duesLabel = () => `Pay ${money(duesTotal(currentMonths() || 1))}`;
const currentMonths = () => parseMonths(monthsInput.value);

function renderDues() {
  const m = currentMonths();
  const valid = Number.isInteger(m) && m >= 1 && m <= MAX_MONTHS;
  if (!valid) return;
  const total = money(duesTotal(m));
  $("dues-calc").textContent = `${m} ${m === 1 ? "month" : "months"} × ${money(MONTHLY_RATE)}`;
  const amt = $("dues-total");
  if (amt.textContent !== total) { amt.textContent = total; amt.classList.remove("bump"); void amt.offsetWidth; amt.classList.add("bump"); }
  if (!busy) duesBtn.querySelector(".cta-text").textContent = `Pay ${total}`;
}
function stepMonths(delta) {
  const m = currentMonths();
  const base = Number.isInteger(m) ? m : 1;
  monthsInput.value = Math.min(MAX_MONTHS, Math.max(1, base + delta));
  setError("dues-months", "");
  renderDues();
}
$("months-dec").addEventListener("click", () => stepMonths(-1));
$("months-inc").addEventListener("click", () => stepMonths(1));
monthsInput.addEventListener("input", renderDues);

/* ---------- Validation ---------- */
function validateName(id) { return setError(id, $(id).value.trim() ? "" : "Enter your full name."); }
// function validateEmail(id) {
//   const v = $(id).value;
//   return setError(id, !v.trim() ? "Enter your email address." : emailOk(v) ? "" : "Enter a valid email address, like name@example.com.");
// }
function validateMonths() {
  const m = currentMonths();
  if (!Number.isInteger(m) || m < 1) return setError("dues-months", "Enter a whole number of months, 1 or more.");
  if (m > MAX_MONTHS) return setError("dues-months", `You can pay up to ${MAX_MONTHS} months at a time.`);
  return setError("dues-months", "");
}
function validateAmount() {
  const a = parseAmount($("other-amount").value);
  if (Number.isNaN(a)) return setError("other-amount", "Enter an amount in GHS, for example 50 or 50.75.");
  return setError("other-amount", a > 0 ? "" : "Amount must be greater than zero.");
}
const placeholderEmail = "tingre@gmail.com";
/* ---------- Paystack ---------- */
function openCheckout({ prefix, button, idleLabel, name, email, ghs, metadata }) {
  if (busy) return;
  if (!window.PaystackPop) { setStatus(prefix, "Payment service didn't load. Check your connection and refresh the page.", "bad"); return; }
  if (!PAYSTACK_PUBLIC_KEY || PAYSTACK_PUBLIC_KEY.includes("REPLACE")) {
    setStatus(prefix, "Payments aren't set up yet. Please contact Tingre support.", "bad"); return;
  }
  busy = true;
  setLoading(button, true, "Opening secure checkout…");
  setStatus(prefix, "");
  const reset = () => { busy = false; setLoading(button, false, idleLabel()); };
  const reference = newReference();
  
  try {
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email:placeholderEmail,
      amount: toPesewas(ghs),
      currency: CURRENCY,
      channels: ["mobile_money"],
      ref: reference,
      metadata: { ...metadata, custom_fields: Object.entries(metadata).map(([k, v]) => ({ display_name: k, variable_name: k, value: String(v) })) },
      callback: (response) => {
        reset();
        // Display only. The real status must be confirmed server-side (see README notes below).
        showSuccess({ name, ghs, months: metadata.months_paid, reference: response.reference || reference });
      },
      onClose: () => { reset(); setStatus(prefix, "Payment window closed. You haven't been charged. Try again when you're ready.", "info"); },
    });
    handler.openIframe();
  } catch (err) {
    console.error("Paystack init failed", err);
    reset();
    setStatus(prefix, "We couldn't open checkout. Check your connection and try again.", "bad");
  }
}

/* ---------- Submit handlers ---------- */
$("dues-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = [validateMonths(), validateName("dues-name")].every(Boolean);
  if (!ok) { document.querySelector("#dues-form [aria-invalid=true]")?.focus(); return; }
  const months = currentMonths(), name = $("dues-name").value.trim();
  openCheckout({
    prefix: "dues", button: duesBtn, idleLabel: duesLabel, name, email: placeholderEmail,
    ghs: duesTotal(months), metadata: { full_name: name, months_paid: months },
  });
});
$("other-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = [validateName("other-name"),  validateAmount()].every(Boolean);
  if (!ok) { document.querySelector("#other-form [aria-invalid=true]")?.focus(); return; }
  const name = $("other-name").value.trim(), amount = parseAmount($("other-amount").value);
  openCheckout({
    prefix: "other", button: $("other-pay"), idleLabel: () => "Pay now", name, email: placeholderEmail,
    ghs: amount, metadata: { full_name: name, payment_type: "other_payment", amount },
  });
});
["dues-name", "other-name"].forEach((id) =>
  $(id).addEventListener("blur", () => ($(id).value ? validateName(id) : null)));
$("other-amount").addEventListener("blur", () => $("other-amount").value && validateAmount());

/* ---------- Success dialog ---------- */
const dialog = $("success-dialog");
function showSuccess({ name, ghs, months, reference }) {
  const rows = [["Member", name], months ? ["Months paid", months] : ["Payment type", "Other payment"], ["Amount", money(ghs)], ["Reference", reference]];
  const dl = $("success-details");
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = k; dd.textContent = String(v); return [dt, dd];
  }));
  dialog.showModal();
}
$("success-close").addEventListener("click", () => {
  dialog.close();
  $("dues-form").reset(); $("other-form").reset();
  monthsInput.value = 1; renderDues();
  $("dues").scrollIntoView({ behavior: "smooth" });
});

$("year").textContent = new Date().getFullYear();
renderDues();

/* Production notes: Paystack's callback runs in the browser and can be faked.
   Treat it as UI feedback only. On your server: (1) expose a webhook (POST /paystack/webhook) that checks the
   x-paystack-signature HMAC with your SECRET key; (2) call GET https://api.paystack.co/transaction/verify/:reference
   and confirm status, amount (pesewas) and currency; (3) store the record keyed by reference (idempotent) and reconcile
   against it. Keep sk_ keys on the server only. */
