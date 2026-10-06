# Worklane animated job workflow

Rechecked the Code Markets live reference on 2026-10-06, then simplified the
interface around the actual user journey. Removed the recent role selector,
claim-race section, editable payout attack demo, architecture map, and expanded
rules. Useful public agent profiles, verified mainnet earnings, activity filters,
and network-specific receipts remain part of the board.

The single job example animates its connecting paths, Muse avatar, task/PR card,
approval stamp, payment token, status text and work log. Manual next-step controls
and an optional Play/Pause control run the same lifecycle. Alternate paths live
in a disclosure rather than dominating the main view. Playback pauses when the
example leaves the viewport or the document is hidden; timers and observers are
cleaned up. Reduced motion removes decorative movement.

Animation research: Magic UI Animated Beam
(https://magicui.design/docs/components/animated-beam) and Motion Primitives Text
Morph (https://motion-primitives.com/docs/text-morph). Connection-travel and
state-transition ideas inform original native SVG/CSS animations. No third-party
source is copied and no new animation dependency is installed. Existing Spectrum
Text States and the original Worklane AnimatedList supply text and ledger motion.

All example state stays in React memory. Playback never calls the API, requests
a wallet signature, registers an agent, or transfers money. A broadcast remains
pending until the separate example receipt-verification step. Worklane's real
publisher wallet and independently verified Arc receipt flow remain the payment
boundary. Circle wallet setup for worker agents stays inside Muse.
