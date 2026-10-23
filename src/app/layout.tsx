import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/theme-context";

import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reflect Total Solutions ERP",
  description:
    "Enterprise Resource Planning platform. Manage operations, jobs, suppliers, and invoices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;

                // 1. Strip and prevent extension attributes (e.g. Bitdefender's bis_skin_checked)
                function cleanBisAttributes(node) {
                  if (!node || node.nodeType !== 1) return;
                  var attrs = node.attributes;
                  if (!attrs) return;
                  for (var i = attrs.length - 1; i >= 0; i--) {
                    var attrName = attrs[i].name;
                    if (attrName && attrName.indexOf('bis_') === 0) {
                      node.removeAttribute(attrName);
                    }
                  }
                }

                try {
                  var observer = new MutationObserver(function(mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                      var m = mutations[i];
                      if (m.type === 'attributes' && m.attributeName && m.attributeName.indexOf('bis_') === 0) {
                        m.target.removeAttribute(m.attributeName);
                      } else if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                          var n = m.addedNodes[j];
                          if (n.nodeType === 1) {
                            cleanBisAttributes(n);
                            if (n.querySelectorAll) {
                              var bisEls = n.querySelectorAll('[bis_skin_checked],[bis_size],[bis_register],[bis_frame_id]');
                              for (var k = 0; k < bisEls.length; k++) {
                                cleanBisAttributes(bisEls[k]);
                              }
                            }
                          }
                        }
                      }
                    }
                  });
                  observer.observe(document.documentElement, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['bis_skin_checked', 'bis_size', 'bis_register', 'bis_frame_id']
                  });
                } catch(e) {}

                try {
                  var origSet = Element.prototype.setAttribute;
                  Element.prototype.setAttribute = function(name, val) {
                    if (typeof name === 'string' && name.indexOf('bis_') === 0) {
                      return;
                    }
                    return origSet.apply(this, arguments);
                  };
                } catch(e) {}

                // 2. Filter console.error / console.warn to block extension-induced hydration warnings from terminal relay
                function isBisMismatch(args) {
                  for (var i = 0; i < args.length; i++) {
                    var a = args[i];
                    if (typeof a === 'string' && (a.indexOf('bis_skin_checked') !== -1 || (a.indexOf('hydration-mismatch') !== -1 && a.indexOf('bis_') !== -1))) return true;
                    if (a && typeof a === 'object') {
                      try {
                        var text = (a.message || '') + ' ' + (a.stack || '') + ' ' + (a.digest || '') + ' ' + JSON.stringify(a);
                        if (text.indexOf('bis_skin_checked') !== -1) return true;
                      } catch(e) {}
                    }
                  }
                  return false;
                }

                var currentError = console.error;
                try {
                  Object.defineProperty(console, 'error', {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                      return function() {
                        if (isBisMismatch(arguments)) return;
                        return currentError.apply(console, arguments);
                      };
                    },
                    set: function(fn) {
                      currentError = fn;
                    }
                  });
                } catch(e) {
                  console.error = function() {
                    if (isBisMismatch(arguments)) return;
                    return currentError.apply(console, arguments);
                  };
                }

                var currentWarn = console.warn;
                try {
                  Object.defineProperty(console, 'warn', {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                      return function() {
                        if (isBisMismatch(arguments)) return;
                        return currentWarn.apply(console, arguments);
                      };
                    },
                    set: function(fn) {
                      currentWarn = fn;
                    }
                  });
                } catch(e) {
                  console.warn = function() {
                    if (isBisMismatch(arguments)) return;
                    return currentWarn.apply(console, arguments);
                  };
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
