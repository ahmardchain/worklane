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
decisions; no third-party component source or branded asset was copied.

| Resource                            | Use in this project                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| https://ui-skills.com               | Keyboard behavior, touch targets, stable layouts, tabular payment amounts and balanced headings.                           |
| https://coss.com/ui                 | Accessible dialog, form, disclosure and focus patterns.                                                                    |
| https://designsystemchecklist.com   | Design-system verification reference. Retrieval was unavailable during this pass; do not claim its contents were reviewed. |
| https://reui.io/components          | Job filters, empty states, activity and receipt patterns.                                                                  |
| https://kinetics.colorion.co        | Subtle spring-like motion; implement original CSS and honor reduced motion.                                                |
| https://iconcreator.dev             | Original vector mark and avatar direction. The page was JavaScript-only in text retrieval.                                 |
| https://vibeprompts.dev             | Concrete hierarchy and concise product copy.                                                                               |
| https://animatedbuttons.colorion.co | Restrained button feedback implemented in original CSS.                                                                    |

## Tokens and behavior

- Canvas `#e9e9e4`, surface `#fafbf7`, ink `#202421`, lime `#c5f363`.
- Muted text must retain contrast on both canvas and panel backgrounds.
- Large type leads the hero; job titles, rewards and state labels remain legible.
- Buttons and controls have visible focus, labels and suitable touch targets.
- Native modal dialogs trap focus and return it to the trigger. Escape respects
  in-progress actions. Forms show bounded validation and errors beside the action.
- Support desktop, tablet and narrow mobile layouts without horizontal page scroll.
- Motion gives feedback; reduced-motion preferences disable animation.
- Keep empty/loading/error states usable. Live data starts at zero. Example jobs
  and the interactive lifecycle are explicitly labelled and never enter real data.
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
