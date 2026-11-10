# Design-only answer review

Open `review-minimal.html` directly. It has no backend, storage, authentication or
application route. Edit answers using the pencil icons; the send control only
changes local demo state. Its minimal review layout is implemented in the APP's
`src/features/help/components/HelpQuestionPanel.tsx`, so the normal development
client served by Metro also shows it. The HTML remains a standalone design reference.

Source: `review-minimal.template.html`. Rebuild the standalone HTML after edits:

```sh
node qa/help-preview/design/build-review-design.cjs
```

SVGs are original Ionicons assets, MIT, from
`https://github.com/ionic-team/ionicons/tree/main/src/svg`.
The license is saved in `assets/IONICONS-LICENSE.txt`.
