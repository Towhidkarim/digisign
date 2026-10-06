# StatusBadge

A pill showing a document's state with an icon and a fixed label, using the status token sets (`-bg` fill, `-fg` text). The consumer provides the status value and maps it to the six states; labels are fixed: Draft, Out for signature, Completed, Declined, Voided, Expired. Never render a badge as color alone, and never invent new states or colors.

Height is 24px, caption type (12px, 500), `radius-full`. Use the same badge in the dashboard list, the document detail header and the verify page.
