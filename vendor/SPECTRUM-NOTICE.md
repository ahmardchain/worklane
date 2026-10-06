The TextStates, TiltCard, MorphButton and EventBadge components in components/spectrumui
are adapted from Spectrum UI by Arihant Jain:
https://github.com/arihantcodes/spectrum-ui

Upstream source is licensed under Apache-2.0. The complete license is in
SPECTRUM-LICENSE. Original component documentation and attribution are retained.
TextStates credits the text-swap recipe by Jakub Antalík at transitions.dev.

EventBadge adapts the suspended drag-and-swing interaction described by
https://ui.spectrumhq.in/docs/badge and its public source at
app/registry/badge/badgedemo.tsx. Worklane uses a native damped spring, CSS 3D
and an SVG strap instead of Three.js, React Three Fiber and Rapier. It uses
Worklane's original HTML identity artwork; Vercel's badge model, textures and
branding are not included. Keyboard input, touch scrolling, bounded dragging,
offscreen cleanup and reduced-motion behavior are additions in this adaptation.

Worklane adaptations: existing design tokens, native CSS/Web Animations instead
of a Motion dependency, immediate accessible labels, mouse-only tilt without
glare, reduced-motion handling, and stable button sizing. The segmented
controls, disclosure and activity layout components are original Worklane code.
