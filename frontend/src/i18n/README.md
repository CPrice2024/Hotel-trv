# Public website languages

The circular header selector uses `language.ts` to translate public navigation,
pages, booking forms, receipts, validation messages and support chat. Preferences
are saved in localStorage. Arabic applies `dir="rtl"`; other languages use LTR.
React subscriptions update mounted pages without resetting form state.

`translations.tsv` is the editable source. Each line contains:

`English|French|Arabic|Amharic|Afaan Oromo`

From the repository root, rebuild the bundled JSON after editing:

```sh
node frontend/scripts/build-translations.cjs
node --test frontend/scripts/test-language.cjs
npm run build --workspace frontend
```

Use `translateText("English phrase")` for rendered labels and `useLanguage()` in
components that display them. `translateText` also recognizes named placeholders
such as `{count}` in catalog entries and preserves their runtime values.
`getLocale()` and `formatStayDate()` support localized amounts and date labels.

Known seeded room names and descriptions have translations. New custom room text
and new backend error messages need corresponding entries; unknown content stays
in its original language. Guest-entered names, messages, emails and payment
references are displayed as entered. Payment-provider pages, external map tiles
and staff administration are managed separately from the public-site selector.

The translations are initial drafts and can be refined by native-speaking hotel
staff in the TSV file. No translation service receives guests' data at runtime.

The browser smoke check uses Chrome DevTools on port 9231 and Vite on port 5173:
`node frontend/scripts/check-language-browser.cjs`. It mocks hotel APIs and makes
no booking or payment. It checks all five languages, responsive positioning, RTL,
saved preferences, keyboard dismissal and form-state retention.
