// Real candidates are no longer kept here in plain text. The scanner (/workspace/rebella-pipeline) writes them,
// AES-GCM encrypted with a key derived from the moderation passcode, to ../queue.enc.json; js/app.js decrypts it after unlock.
window.REBELLA_ITEMS = [];
