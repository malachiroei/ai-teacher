import tls from "node:tls";

let applied = false;

/** Trust Windows/macOS system CAs so Gemini works behind SSL inspection. */
export function trustSystemCertificates() {
  if (applied) return;
  applied = true;
  try {
    const setDefault = (tls as typeof tls & {
      setDefaultCACertificates?: (certs: string[]) => void;
      getCACertificates?: (type?: string) => string[];
    }).setDefaultCACertificates;
    const getCerts = (tls as typeof tls & { getCACertificates?: (type?: string) => string[] }).getCACertificates;
    if (typeof setDefault === "function" && typeof getCerts === "function") {
      setDefault([...getCerts("default"), ...getCerts("system")]);
    }
  } catch (error) {
    console.warn("Could not load system TLS certificates:", error);
  }
}
