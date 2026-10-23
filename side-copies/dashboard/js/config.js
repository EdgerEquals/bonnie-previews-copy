// Rebella moderation gate config. SCRUBBED for this public review copy: the real salt and hash were removed.
// unset:true makes the page show "Passcode not set up yet" instead of unlocking. Nothing here can open the real dashboard.
window.REBELLA_GATE = { unset: true, algo: "PBKDF2-SHA256", iterations: 250000, salt: "REPLACE_ME", hash: "REPLACE_ME" };
