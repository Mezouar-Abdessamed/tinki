import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDocs, mockGetDoc, mockSetDoc, mockUpdateDoc, mockAuth } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(async () => ({ docs: [] })),
  mockGetDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({
      id: "link-1",
      profile_id: "uid-123",
      name: "My Link",
      url: "https://example.com",
      icon: "globe",
      enabled: true,
      position: 0,
      link_type: "link",
    }),
  })),
  mockSetDoc: vi.fn(async () => undefined),
  mockUpdateDoc: vi.fn(async () => undefined),
  mockAuth: {
    currentUser: {
      uid: "uid-123",
      email: "owner@example.com",
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    },
  },
}));

vi.mock("firebase/app", () => ({
  getApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  getAuth: vi.fn(() => mockAuth),
  setPersistence: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn((_db, name: string) => ({ name })),
  deleteDoc: vi.fn(async () => undefined),
  doc: vi.fn((_db, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: mockGetDoc,
  getDocFromServer: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: mockGetDocs,
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  orderBy: vi.fn(),
  query: vi.fn((ref) => ref),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

import { CustomLinksList, safeHref } from "../src/components/CustomLinksList";
import {
  createCustomLinkFirestore,
  updateCustomLinkFirestore,
  validateCustomLinkUrl,
} from "../src/lib/firestore-repository";

const DANGEROUS_URL_VARIANTS = [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "JaVaScRiPt:alert(document.cookie)",
  "  javascript:alert(1)",
  "\t\n  JAVASCRIPT:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "  data:text/plain,evil",
  "\n\tdata:text/html,evil",
  "vbscript:msgbox(1)",
  "VBSCRIPT:msgbox(1)",
  "  vbscript:msgbox(1)",
  "\t VBSCRIPT:Execute('msgbox 1')",
  "file:///etc/passwd",
  "http:alert(1)",
  "",
  "   ",
];

describe("custom link URL validation across repository and UI rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: "link-1",
        profile_id: "uid-123",
        name: "My Link",
        url: "https://example.com",
        icon: "globe",
        enabled: true,
        position: 0,
        link_type: "link",
      }),
    });
  });

  it("validateCustomLinkUrl rejects dangerous schemes and whitespace-prefixed variants across all link types", () => {
    for (const badUrl of DANGEROUS_URL_VARIANTS) {
      expect(() => validateCustomLinkUrl(badUrl, "link")).toThrow();
      expect(() => validateCustomLinkUrl(badUrl, "email")).toThrow();
      expect(() => validateCustomLinkUrl(badUrl, "phone")).toThrow();
    }

    // Scheme/link_type mismatches must throw
    expect(() => validateCustomLinkUrl("mailto:user@example.com", "link")).toThrow();
    expect(() => validateCustomLinkUrl("tel:+15551234567", "link")).toThrow();
    expect(() => validateCustomLinkUrl("https://example.com", "email")).toThrow();
    expect(() => validateCustomLinkUrl("https://example.com", "phone")).toThrow();
    expect(() => validateCustomLinkUrl("mailto:", "email")).toThrow();
    expect(() => validateCustomLinkUrl("tel:", "phone")).toThrow();

    // Allowed URLs per link_type succeed and normalize scheme case
    expect(validateCustomLinkUrl("  HTTPS://Example.com/profile?a=1 ", "link")).toBe(
      "https://Example.com/profile?a=1",
    );
    expect(validateCustomLinkUrl("http://example.com/page", "link")).toBe(
      "http://example.com/page",
    );
    expect(validateCustomLinkUrl("  MAILTO:hi@example.com ", "email")).toBe(
      "mailto:hi@example.com",
    );
    expect(validateCustomLinkUrl("  TEL:+15551234567 ", "phone")).toBe("tel:+15551234567");
  });

  it("createCustomLinkFirestore rejects dangerous URLs before calling setDoc", async () => {
    for (const badUrl of DANGEROUS_URL_VARIANTS) {
      await expect(
        createCustomLinkFirestore({
          name: "Bad Link",
          url: badUrl,
          icon: "globe",
          link_type: "link",
        }),
      ).rejects.toThrow();
    }
    expect(mockSetDoc).not.toHaveBeenCalled();

    await createCustomLinkFirestore({
      name: "Portfolio",
      url: "https://example.com/work",
      icon: "portfolio",
      link_type: "link",
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Portfolio",
        url: "https://example.com/work",
        link_type: "link",
      }),
    );
  });

  it("updateCustomLinkFirestore rejects dangerous URLs and enforces stored link_type on partial patches", async () => {
    for (const badUrl of DANGEROUS_URL_VARIANTS) {
      await expect(
        updateCustomLinkFirestore("link-1", { url: badUrl, link_type: "link" }),
      ).rejects.toThrow();
      await expect(updateCustomLinkFirestore("link-1", { url: badUrl })).rejects.toThrow();
    }
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    // Partial url-only update respects existing doc's link_type ("email")
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: "link-email",
        profile_id: "uid-123",
        name: "Contact",
        url: "mailto:old@example.com",
        icon: "email",
        enabled: true,
        position: 0,
        link_type: "email",
      }),
    });
    await expect(
      updateCustomLinkFirestore("link-email", { url: "https://example.com" }),
    ).rejects.toThrow(/mailto:/i);
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    // Non-URL toggle patches still succeed cleanly
    await updateCustomLinkFirestore("link-1", { enabled: false });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });

  it("safeHref returns undefined for javascript:, JAVASCRIPT:, data:, vbscript: and whitespace-prefixed variants", () => {
    for (const badUrl of DANGEROUS_URL_VARIANTS) {
      expect(safeHref(badUrl)).toBeUndefined();
    }
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref("https://")).toBeUndefined();
    expect(safeHref("mailto:")).toBeUndefined();
    expect(safeHref("tel:")).toBeUndefined();

    // Safe schemes (trimmed, case-insensitive) return trimmed URL
    expect(safeHref("  HTTPS://example.com/path?x=1  ")).toBe("HTTPS://example.com/path?x=1");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("  MAILTO:hi@example.com ")).toBe("MAILTO:hi@example.com");
    expect(safeHref("  tel:+15551234567 ")).toBe("tel:+15551234567");
  });

  it("CustomLinksList omits href attributes for unsafe URLs while rendering safe hrefs", () => {
    const html = renderToStaticMarkup(
      createElement(CustomLinksList, {
        links: [
          {
            id: "bad-js",
            profile_id: "p1",
            name: "Unsafe JS",
            url: "  JAVASCRIPT:alert(1)",
            icon: "globe",
            enabled: true,
            position: 0,
            link_type: "link",
            created_at: "",
            updated_at: "",
          },
          {
            id: "bad-data",
            profile_id: "p1",
            name: "Unsafe Data",
            url: " data:text/html,<script>alert(1)</script>",
            icon: "globe",
            enabled: true,
            position: 1,
            link_type: "link",
            created_at: "",
            updated_at: "",
          },
          {
            id: "good-https",
            profile_id: "p1",
            name: "Safe Site",
            url: "https://example.com/safe",
            icon: "globe",
            enabled: true,
            position: 2,
            link_type: "link",
            created_at: "",
            updated_at: "",
          },
        ],
      }),
    );

    expect(html).not.toMatch(/href=["'][^"']*(javascript:|data:|vbscript:)/i);
    expect(html).toContain('href="https://example.com/safe"');
  });
});
