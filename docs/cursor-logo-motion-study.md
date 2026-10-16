# Cursor header logo motion study, 15 October 2026

Studied the live [Cursor homepage](https://cursor.com/), its header DOM, the public client bundle, and the [dark-theme video](https://cursor.com/marketing-static/logo/logo-dark-theme.mp4). This is a study of the navigation logo above the hero.

## Observed motion

The icon performs a short three-dimensional turn. Its visible faces and projected silhouette change, then return to the initial logo pose. The wordmark stays fixed. Browser inspection measured the loaded MP4 at 498 × 544 pixels and 1.52 seconds. Scrubbed frames were captured at 0.00, 0.21, 0.69, 1.11, and 1.52 seconds. The animation begins and ends in the same pose. No exact 3D axis, modeling tool, frame rate, or animation easing curve was established.

## Verified implementation

The static logo and wordmark are SVG paths. A positioned video overlays the icon area and transitions its opacity over 500 ms. The video is muted, inline, and has no native loop or autoplay attribute. The current browser loaded the MP4; MOV and WebM source elements also appear in the component. Separate asset paths exist for light and dark themes.

The public component starts playback at time zero and rate one on mouse entry for a fine pointer with hover. It does not restart a clip already playing. At the end, it schedules another play after 750 ms while hovered. Mouse leave clears the hover state, allowing the current clip to finish; when no longer hovered, the ended handler pauses it and sets video opacity to zero, revealing the SVG beneath.

The component also triggers once when scroll position first exceeds 10 pixels. Its reduced-motion check suppresses playback. Touch/non-hover handling bypasses mouse-hover initiation. Safari uses metadata preloading and defers the play request with an idle callback where available. These details were read from source; only the desktop hover and video playback were exercised live.

Source: [public logo component bundle](https://cursor.com/marketing-static/_next/static/chunks/10~t.8~jpbcrg.js?dpl=dpl_5ZaQfbGVyHzNEjvnZRNjc2JAXnfF). The deployment-specific URL may change.

## Application to concept B

The transferable idea is a coherent object moving through a brief controlled turn and landing exactly on its resting mark. For the square with a star cutout, explore a shallow tile with the star cut through it, a stationary wordmark, and one deliberate turn returning to the front-facing square. Model the object's depth and occlusion consistently. Judge it at header size. Avoid adding independent wobbles or sliding pieces without a clear physical relationship.

A short rendered clip is the closest implementation to Cursor's current approach. A live 3D scene would add runtime complexity without evidence it is needed for this small fixed gesture. Choose the gesture first, then decide how to render it. No new logo animation was implemented as part of this study.

Raw public-source extracts and browser screenshots are under ignored `artifacts/cursor-logo-study/`. `filmstrip.png` assembles the captured browser frames, with timestamps. No Cursor media was copied into the product's public assets.
