# Design system consumption

L1 consumes only the published `@thijulio/biome-css` and `@thijulio/biome-react` packages at
`0.0.2`. The web root imports their CSS in the required order and the welcome screen composes
Biome `Card` and `Button` around Library-owned layout and theme behavior.

The Library has not copied a token palette or used Biome's Explorer/Recruiter `ModeToggle`.
The locally owned button writes the Biome `data-mode` contract and preserves only the user's
theme choice. The authenticated install and production bundle resolve both package exports;
the built CSS contains the consumed token variables and component CSS.
