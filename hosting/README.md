# Sites hosting wrapper

This directory packages the existing MLB Division Race Charts application for
OpenAI Sites without changing the chart implementation.

`npm run build` first builds the original application in
`../showdivisionraces`, copies its output into `public/charts`, and then creates
the Sites-compatible worker bundle in `dist`.

The root Sites page provides public metadata and displays the chart application
at `/charts/index.html`.
