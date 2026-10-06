# Worklane interface rules

## Goal and reference

A GitHub coding job board for agents, with owner review and verified Arc USDC
payments. The reference at https://job.code.markets was observed in the browser.
Retain the useful idea of a readable work floor, identity pass and explorable
lifecycle. Worklane's layout, SVG artwork, copy and implementation are original.

Use a pale stone canvas, warm white panels, black type and restrained lime
emphasis. Geist and Geist Mono are bundled locally. Dark mode is supported.
No gradients. Use Lucide icons and original SVG agent avatars; no emoji substitutes.

## Resources to consult

All eight resources were checked during the initial design pass. They inform
decisions. Spectrum's components were reviewed in October 2026 and adapted
under Apache-2.0; see vendor/SPECTRUM-NOTICE.md and vendor/SPECTRUM-LICENSE.

| Resource                            | Use in this project                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| https://ui-skills.com               | Keyboard behavior, touch targets, stable layouts, tabular payment amounts and balanced headings.                                                                               |
| https://coss.com/ui                 | Accessible dialog, form, disclosure and focus patterns.                                                                                                                        |
| https://designsystemchecklist.com   | Design-system verification reference. Retrieval was unavailable during this pass; do not claim its contents were reviewed.                                                     |
| https://reui.io/components          | Job filters, empty states, activity and receipt patterns.                                                                                                                      |
| https://kinetics.colorion.co        | Subtle spring-like motion; implement original CSS and honor reduced motion.                                                                                                    |
| https://iconcreator.dev             | Original vector mark and avatar direction. The page was JavaScript-only in text retrieval.                                                                                     |
| https://vibeprompts.dev             | Concrete hierarchy and concise product copy.                                                                                                                                   |
| https://animatedbuttons.colorion.co | Restrained button feedback implemented in original CSS.                                                                                                                        |
| https://ui.spectrumhq.in            | Event Badge drag-and-swing behavior, Text States and Morph Button adapted to Worklane's tokens; sliding selections and activity transitions use native CSS and Web Animations. |

## Tokens and behavior

- Canvas `#e9e9e4`, surface `#fafbf7`, ink `#202421`, lime `#c5f363`.
- Muted text must retain contrast on both canvas and panel backgrounds.
- Large type leads the hero; job titles, rewards and state labels remain legible.
- Buttons and controls have visible focus, labels and suitable touch targets.
- Native modal dialogs trap focus and return it to the trigger. Escape respects
  in-progress actions. Forms show bounded validation and errors beside the action.
- Support desktop, tablet and narrow mobile layouts without horizontal page scroll.
- Motion gives feedback; reduced-motion preferences disable animation.
- The hero agent ID uses Spectrum's suspended Event Badge interaction, adapted
  to readable HTML, an SVG lanyard and native CSS 3D. Drag and release to swing;
  arrow keys and Enter provide the same interaction, and Escape resets it.
  Touch permits sideways dragging and vertical page scrolling. Reduced motion
  removes spring settling and 3D rotation. Motion stops when hidden or offscreen.
  The card is clearly marked as an example identity. No external model assets,
  WebGL requirement or continuous animation is needed.
  Selection highlights slide between real choices, disclosures retain their
  semantic expanded state, and clipboard success appears only after a successful
  copy. Activity rows animate once when inserted or moved. Avoid autoplay effects.
- Keep empty/loading/error states usable. Live data starts at zero. Example jobs
  and the interactive lifecycle are explicitly labelled and never enter real data.
- Keep the workflow focused on one animated job. Connection pulses, Muse/PR
  card motion, approval and transfer feedback explain each step. Play/Pause is
  opt-in; it stops offscreen or when hidden. Alternate paths use a disclosure.
  Honor reduced motion. Keep architecture and security explanations in docs.
- Use themes only in local storage. Never store agent API keys or signatures there.
- Worker onboarding is for Muse. The primary action is Copy for Muse; the prompt
  delegates Circle setup and API registration to Muse. Keep login, email/OTP,
  wallet signatures and worker keys in Muse. Do not ask the publisher to activate
  an agent wallet in this browser or in the development assistant.
  Browser wallet selection belongs in publisher treasury setup and payments.
  Never imply Muse is registered or a wallet exists before setup completes.

## Six-step change process

1. Read the current code, user flow, this file and the applicable reference pages.
2. Choose the layout and type hierarchy before adding visual detail.
3. Implement semantic components with loading, empty, error and success states.
4. Check keyboard behavior, contrast, responsive wrapping and reduced motion.
5. Run type checking and relevant behavior tests; build the exact source to deploy.
6. Inspect desktop and mobile in a supported browser preview when available, then
   publish that source state. Report any verification that was unavailable.
