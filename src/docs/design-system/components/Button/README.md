# Button

The one button for the whole product: shadcn `Button` restyled with these tokens. Variants: primary (`brand` fill, one per view), secondary (surface with `border-control` edge), ghost (text only, for Cancel and tertiary actions), and destructive (outlined `danger`, becoming a solid `danger` fill only inside a confirmation dialog). The consumer provides the label and icon; labels name the result ("Send for signature").

Heights: 40px default, 32px in dense toolbars, 44px on touch screens in the signer flow. Focus is a 2px `ring` with 2px offset. Never write a raw `<button>` with ad hoc classes; use this component so height and radius stay identical across pages.
