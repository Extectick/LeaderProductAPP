import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  const captureLaunchScript = `
    (function () {
      try {
        var w = window;
        w.__tgInitialLaunch = {
          href: w.location && w.location.href ? String(w.location.href) : '',
          search: w.location && w.location.search ? String(w.location.search) : '',
          hash: w.location && w.location.hash ? String(w.location.hash) : '',
        };
      } catch (e) {}
    })();
  `;

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0F172A" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: captureLaunchScript }} />
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
