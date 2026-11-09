/** Inline brand mark for HTML email (no external image host required). */
export const emailBrandHeaderHtml = (): string => {
  const shieldSvg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="none"><rect width="44" height="44" rx="12" fill="#4f6cf7"/><path d="M22 9.5L31 13.2v8.1c0 6.2-3.8 11.9-9 14.2-5.2-2.3-9-8-9-14.2v-8.1L22 9.5Z" fill="#ffffff" fill-opacity="0.92"/><path d="M18.2 22.4l2.5 2.5 5.5-6.2" stroke="#4f6cf7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  );

  return `
    <div style="padding:22px 28px 0;text-align:center;">
      <img src="data:image/svg+xml,${shieldSvg}" width="44" height="44" alt="NovaSafe" style="display:inline-block;border:0;outline:none;" />
      <div style="margin-top:10px;font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">NovaSafe</div>
      <div style="margin-top:4px;font-size:10px;font-weight:600;letter-spacing:0.18em;color:#64748b;">IDENTITY VAULT</div>
    </div>`;
};
