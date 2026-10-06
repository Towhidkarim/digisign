# DocumentRow

One document in the dashboard and Documents lists: a file icon tile, title, one line saying who it is waiting on (or what happened), a segmented progress bar with one segment per signer, the StatusBadge, and a relative date. The whole row is one link to the document's detail page. Rows sit inside a `surface` card with `border` dividers and a `surface-subtle` hover.

The consumer provides the title, status, signer count, signed count, the name of the next signer and the updated date. Drafts link back into the editor and may show "Continue editing" as a ghost button on hover and always on touch screens. Minimum row height 72px.
