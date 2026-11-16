// Backup codes (v4.8.1): GooberCord's management dialog for the shared
// single-use TOTP backup codes. One small dialog off the user panel: the
// confirm IS the dialog's copy (regeneration REPLACES the old set), the
// current password — plus a 6-digit code or an unburned backup code when
// two-factor is on — re-proofs the member, and the fresh batch shows RAW
// codes exactly once. This dialog never keeps them: any close or re-render
// throws them away, and a reload cannot bring them back.
import { api } from "../api.js";
import { el } from "../dom.js";
import { state } from "../state.js";

const CODE_COUNT_NOTE = "10 codes, each single-use.";

function codesElement(doc, codes) {
  const grid = el("div", { class: "backup-code-grid", role: "list", "aria-label": "Your new backup codes" });
  for (const code of codes) {
    grid.append(el("code", { class: "backup-code", role: "listitem", text: String(code) }));
  }
  return grid;
}

export function openBackupCodesDialog(doc, win) {
  const me = state.currentUser;
  if (!me) return;

  const passwordField = el("div", { class: "form-field" },
    el("label", { for: "backup-codes-password", text: "Current password" }),
    el("input", {
      id: "backup-codes-password", type: "password", maxlength: "128",
      autocomplete: "current-password", required: "", spellcheck: "false",
    }),
  );

  const error = el("p", { class: "error-strip", role: "alert" });

  // Two-factor on: the confirm-with-MFA field rides the same shared helper
  // server-side — the authenticator's 6-digit code OR an unburned backup
  // code (the lost-authenticator flow).
  const codeField = me.totpEnabled
    ? el("div", { class: "form-field" },
        el("label", { for: "backup-codes-code", text: "6-digit code or backup code" }),
        el("input", {
          id: "backup-codes-code", type: "text", maxlength: "8", required: "",
          spellcheck: "false",
        }),
        el("p", {
          class: "form-note",
          text: "The 6-digit code proves the authenticator; a backup code works instead if the app is lost.",
        }),
      )
    : null;

  const confirmCopy = el("p", {
    class: "form-note",
    text: "New codes replace your current set — old codes stop working the moment the new set is created.",
  });
  const plainNote = el("p", {
    class: "form-note",
    text: "If you lose your authenticator, a backup code signs you in once. Each code works a single time.",
  });

  const form = el("form", { novalidate: "" }, passwordField, codeField, error);
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const actions = el("div", { class: "form-actions" }, cancel,
    el("button", { class: "button button-primary", type: "submit", text: "Generate 10 new codes" }));

  const dialog = el("dialog", {},
    el("h2", { text: "Backup codes" }),
    plainNote,
    confirmCopy,
    form,
    actions,
  );

  cancel.addEventListener("click", () => dialog.close());

  const showCodes = (codes) => {
    confirmCopy.remove();
    form.remove();
    actions.remove();
    const grid = codesElement(doc, codes);
    const onceNote = el("p", {
      class: "form-note",
      text: "These are shown only now — copy or write them down. " + CODE_COUNT_NOTE,
    });
    const copyAll = el("button", { class: "button button-quiet", type: "button", text: "Copy all" });
    copyAll.addEventListener("click", async () => {
      try {
        await win.navigator.clipboard.writeText(codes.join("\n"));
        copyAll.textContent = "Copied";
      } catch {
        // A denied clipboard keeps the codes on screen; the member can still
        // read them off the grid. (No fallback clipboard hack — CSP-safe.)
      }
    });
    const done = el("button", { class: "button button-primary", type: "button", text: "Done" });
    done.addEventListener("click", () => dialog.close());
    dialog.append(
      el("p", { class: "form-note", text: "Your new backup codes:" }),
      grid,
      onceNote,
      el("div", { class: "form-actions" }, copyAll, done),
    );
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const submit = dialog.querySelector('button[type="submit"]');
    try {
      submit.disabled = true;
      const body = {
        currentPassword: String(form.querySelector("#backup-codes-password")?.value || ""),
      };
      const codeInput = form.querySelector("#backup-codes-code");
      if (codeInput) body.code = String(codeInput.value || "").trim();
      const result = await api("/api/me/totp/backups/generate", { method: "POST", body });
      showCodes(Array.isArray(result?.codes) ? result.codes : []);
    } catch (caught) {
      error.textContent = caught?.message || "The backup codes could not be generated.";
      submit.blur();
    } finally {
      submit.disabled = false;
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("#backup-codes-password")?.focus();
}
