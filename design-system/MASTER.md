# Kin — Apple design direction

Applies the apple-design skill supplied in the conversation. The concrete reference
is the structure and restraint of Photos, Settings, and native iOS sheets.

- Content first: a photo/story library, an explorable family map, and a single camera action.
- System typography, optical sizing, normal body tracking, size-specific heading tracking.
- White canvas; neutral grouped surfaces; blue actions. Color carries state or content type.
- Desktop sidebar; mobile floating labeled tab bar. Translucency belongs to navigation and modal chrome.
- Direct names: Memories, Recognize, Connections, Settings. No decorative slogans in app workflows.
- Sheets use a live position/velocity spring, pointer capture, velocity projection and rubber-banding.
  Both animation directions remain interruptible; only an actual save prevents dismissal.
- 44px minimum controls. Keyboard dialog containment, Escape and close button, focus restoration.
- Reduced motion removes spatial animation; reduced transparency makes chrome solid;
  increased contrast adds stronger boundaries. Layout must reflow at large text sizes.
- Actual family data only. Empty libraries stay empty. Screenshots/tests use isolated fixtures.

Reference: user-provided apple-design skill; Apple Designing Fluid Interfaces (WWDC 2018),
The Details of UI Typography (WWDC 2020), and Human Interface Guidelines.
