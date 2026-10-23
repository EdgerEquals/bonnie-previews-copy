# Phi timing rules (standing, set by the user 2026-10-23)
Applies to every preview and site built for Bonnie (dashboard, chat page, questionnaire, Rebella) and all future builds.

1. PHI = 1.6180339887. Every timed interval is PHI^n seconds. Fast elements make small moves; slow elements make big ones.
2. Start offsets: number the elements k = 1..N; element k starts at period * frac(k * 0.6180339887) (golden angle). Use a negative CSS animation-delay so nothing waits blank.
3. Bonnie's palette ladder (fixed): blinks PHI^2 2.618s, weather faces PHI^2/PHI^3/PHI^4, facts PHI^4 6.854s, loop effect PHI^5 11.09s, animals PHI^5 11.09s, offering story PHI^6 17.94s, sticker sway PHI^7 29.03s, slow drift PHI^8 46.98s.
4. Simmie's palette runs at a higher frequency: every Simmie element's period = its Bonnie-equivalent slot * PHI^-1.5 (about 0.486), i.e. 1.5 phi steps faster. The half step means a Simmie period never equals a Bonnie period, so the two ladders never lock into a repeating alignment.
   Simmie elements: space set (satellite, rocket, comet, moon, command tokens) 17.94 -> 8.72s; cloud-satellite orbit and space drift 46.98 -> 22.84s; mission log ambient line 11.09 -> 5.39s; Ask Dad glow 4.236 -> 2.06s; Ask Dad satellite orbit 6.854 -> 3.33s; terminal cursor and status blinks 2.618 -> 1.27s.
5. New elements: give each a Bonnie-ladder slot by role; if it belongs to Simmie's palette, multiply by PHI^-1.5. Respect reduced motion.

6. Weather sweep (base-frequency modulator). The weather loop itself (faces PHI^2/3/4, offering story PHI^6, sticker sway PHI^7) never changes. Its current state shifts every OTHER element's exponent by s phi steps (negative = faster):
   hot -1 | sun -0.5 | storm 0 | cloud 0 | rain +0.5 | fog +1 | clear night +1.5 | deep night (00:00-05:00 Perth) +2.
   Bonnie and Simmie elements shift by the same s, so Simmie stays 1.5 steps faster and the ladders still never align. Golden-angle offsets are kept. A new s takes effect at each element's next cycle boundary (no jump mid-animation). Reduced motion ignores the sweep.
   Rebella live: the sweep is used only where the page already has weather state; with no weather data, use s = 0.
7. Message-status layer (separate pump). Message status never changes the weather loop or the swept elements. It drives its own visual layer only (a soft glow or pulse ring on the terminal LED, the Chat/Ask Dad buttons and the feed edge), on its own phi ladder:
   idle PHI^5 11.09s slow breathe | new message PHI^3 4.24s | unread from Dad PHI^2 2.62s | urgent (Ask Dad waiting or an unanswered question) PHI^1 1.62s.
   It's only used where messages exist (chat page and dashboard previews and side copies), never on Rebella. It never reads or shows message text.

8. Interaction meters (previews and side copies of the dashboard and chat page only; never live, never Rebella). Controls drive small VU-style level meters with NO microphone or other sensors, only pointer, touch and keyboard input.
   Inputs: press pressure (PointerEvent.pressure where the device reports it, otherwise contact size or held time), hold duration and drag velocity.
   Mapping is non-linear: an ease-out rise (1 - (1-x)^PHI), a soft threshold (nothing below about 0.15), an overshoot of about 1/PHI^3 that settles back, and a decay over PHI^2 seconds. The meter peak-hold drops after PHI^1 seconds.
   Control mix (tasteful, a few per page): the existing buttons, plus one small dial (rotary knob), one lever (slide-and-spring-back) and one toggle switch. Each has its own meter of 5-8 bars in the page palette. The UI calls these "one of many ways to play", with no big labels.
   The meters feed the message-status glow layer (rule 7): a meter peak briefly brightens that layer's glow but never changes its pulse period or the weather loop. Keyboard and reduced-motion users get the same controls, with the meters stepping instead of animating. These controls never send anything.

9. Haptics (same scope as rule 8). Use the same non-linear press model as the meters. If navigator.vibrate exists (Android Chrome and similar):
   gentle press: 8 ms | firm press: 20 ms | above the overshoot threshold: 28 ms | urgent status: double tap [18, 90, 18].
   Rate-limited to at most one pulse per PHI^1 s (urgent at most once per change of status).
   iOS Safari has no vibration API. The only built-in haptic is the native <input type="checkbox" switch> tick (iOS 18+), so the toggle switch is built on that element and gets a real tick on iPhone. Nothing else is faked.
   Optional: a small "haptics" on/off toggle, on by default, saved under a preview-only storage key. Feature-detect everything and wrap it in try/catch: with no support it fails silently, with no errors and no prompts.
