import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AR } from "./i18n-ar";
import { ES } from "./i18n-es";
import { FR } from "./i18n-fr";
import { DE } from "./i18n-de";

export type Lang = "en" | "ar" | "es" | "fr" | "de";
const KEY = "linkme-lang";
const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string };
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s });
export const useLanguage = () => useContext(LangContext);

// Original English text for every node we translate, so switching back is exact.
const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();

// Guard so our own writes don't retrigger the MutationObserver.
let writing = false;

let activeLang: Lang = "en";

function translateString(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (activeLang === "fr") {
    const fr = FR[trimmed];
    return fr ? src.replace(trimmed, fr) : null;
  }
  if (activeLang === "de") {
    const de = DE[trimmed];
    return de ? src.replace(trimmed, de) : null;
  }
  if (activeLang === "es") {
    const es = ES[trimmed];
    return es ? src.replace(trimmed, es) : null;
  }
  const hit = AR[trimmed];
  if (hit) return src.replace(trimmed, hit);
  // Sentences with a user's name, email, or count retain those values.
  const patterns: Array<[RegExp, (matches: RegExpMatchArray) => string]> = [
    [/^Your page lives at \/(.+)$/, (m) => `${AR["Your page lives at"]} /${m[1]}`],
    [/^We sent a 6-digit code to (.+)\. Enter it to activate your account\.?$/, (m) => `أرسلنا رمزًا من 6 أرقام إلى ${m[1]}. أدخله لتفعيل حسابك`],
    [/^Enter the 6-digit code we sent to (.+?)\.?$/, (m) => `أدخل الرمز المكون من 6 أرقام الذي أرسلناه إلى ${m[1]}`],
    [/^Resend code in (\d+)s$/, (m) => `إعادة إرسال الرمز خلال ${m[1]} ث`],
    [/^Bio must be (\d+) characters or fewer$/, (m) => `يجب ألا تتجاوز النبذة ${m[1]} حرفًا`],
    [/^Nobody has claimed \/(.+) yet\. It could be yours\.?$/, (m) => `لم يحجز أحد /${m[1]} بعد. يمكنك حجزه`],
    [/^Deleting your account is permanent\. Your page at \/(.+), your links and your picture are removed for good and cannot be recovered\.?$/, (m) => `حذف حسابك نهائي. ستُحذف صفحتك على /${m[1]} وروابطك وصورتك ولا يمكن استعادتها`],
    [/^This can't be undone\. Your page at \/(.+) will stop working immediately\.?$/, (m) => `لا يمكن التراجع عن هذا. ستتوقف صفحتك على /${m[1]} عن العمل فورًا`],
    [/^(\d+)\/(\d+) — clear the field to remove your bio\.?$/, (m) => `${m[1]}/${m[2]} — امسح الحقل لإزالة نبذتك`],
    [/^Type "(.+)" to confirm$/, (m) => `اكتب "${m[1]}" للتأكيد`],
    [/^Edit (.+)$/, (m) => `تعديل ${m[1]}`],
    [/^Delete your (.+) link\?$/, (m) => `حذف رابط ${m[1]}؟`],
    [/^Delete “(.+)”\?$/, (m) => `حذف «${m[1]}»؟`],
    [/^(.+) link deleted\.?$/, (m) => `تم حذف رابط ${m[1]}`],
    [/^(.+) updated\.?$/, (m) => `تم تحديث ${m[1]}`],
    [/^Yes\. You can add (\d+) platforms including (.+?)\.?$/, (m) => `نعم. يمكنك إضافة ${m[1]} منصة، منها ${m[2]}`],
  ];
  for (const [pattern, format] of patterns) {
    const match = trimmed.match(pattern);
    if (match) return src.replace(trimmed, format(match));
  }
  return null;
}

function translateTextNode(node: Text, lang: Lang) {
  const current = node.nodeValue ?? "";
  const stored = textOriginals.get(node);

  if (lang !== "en") {
    // React may have replaced the text since we last saw it; then the new
    // value is the English source of truth.
    const source =
      stored !== undefined && (current === stored || current === translateString(stored))
        ? stored
        : current;
    const translated = translateString(source);
    if (translated) {
      textOriginals.set(node, source);
      if (current !== translated) {
        writing = true;
        node.nodeValue = translated;
        writing = false;
      }
    }
  } else if (stored !== undefined && current !== stored) {
    writing = true;
    node.nodeValue = stored;
    writing = false;
  }
}

function translateElement(el: Element, lang: Lang) {
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (value == null) continue;
    let map = attrOriginals.get(el);
    if (lang !== "en") {
      const source = map?.get(attr) ?? value;
      const translated = translateString(source);
      if (translated && value !== translated) {
        if (!map) {
          map = new Map();
          attrOriginals.set(el, map);
        }
        map.set(attr, source);
        writing = true;
        el.setAttribute(attr, translated);
        writing = false;
      }
    } else if (map?.has(attr)) {
      writing = true;
      const original = map.get(attr);
      if (original === undefined) continue;
      el.setAttribute(attr, original);
      writing = false;
      map.delete(attr);
    }
  }
}

function translateTree(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = root;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, lang);
    else translateElement(node as Element, lang);
    node = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved === "ar" || saved === "es" || saved === "fr" || saved === "de") setLangState(saved);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";

    // Restore English first so switching between two translations is exact.
    activeLang = "en";
    translateTree(document.body, "en");
    activeLang = lang;
    if (lang === "en") return;
    translateTree(document.body, lang);

    const observer = new MutationObserver((mutations) => {
      if (writing) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((n) => translateTree(n, lang));
        } else if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text, lang);
        } else if (mutation.type === "attributes") {
          translateElement(mutation.target as Element, lang);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    return () => observer.disconnect();
  }, [lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem(KEY, l);
    setLangState(l);
  };

  const t = (s: string) => {
    if (lang === "en") return s;
    const prev = activeLang;
    activeLang = lang;
    const out = translateString(s) ?? s;
    activeLang = prev;
    return out;
  };

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}
