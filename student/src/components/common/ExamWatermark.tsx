import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

interface ExamWatermarkProps {
  customEmail?: string;
  customIdentifier?: string;
  opacity?: number;
}

export const ExamWatermark: React.FC<ExamWatermarkProps> = ({
  customEmail,
  customIdentifier,
  opacity = 0.14,
}) => {
  const { user } = useAuth();

  const email = customEmail || user?.email || 'candidate@proctor.exam';
  const identifier =
    customIdentifier ||
    (user?.name ? user.name : user?.id ? `ID: ${user.id.substring(0, 10).toUpperCase()}` : '');

  // Generate an SVG data URI with rotated repeated text elements matching the reference layout
  const svgDataUrl = useMemo(() => {
    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const safeEmail = escapeXml(email);
    const safeId = escapeXml(identifier);

    // If email is long, we can split it or display it cleanly
    const emailParts = safeEmail.includes('@')
      ? [safeEmail.substring(0, safeEmail.lastIndexOf('@')), safeEmail.substring(safeEmail.lastIndexOf('@'))]
      : [safeEmail, ''];

    const isLongEmail = safeEmail.length > 20;

    const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="340" height="220" viewBox="0 0 340 220">
  <style>
    .watermark-text {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace, sans-serif;
      font-weight: 700;
      letter-spacing: 0.2px;
      user-select: none;
    }
  </style>
  <g transform="rotate(-20 170 110)">
    ${
      isLongEmail && emailParts[1]
        ? `
    <text x="170" y="92" fill="currentColor" fill-opacity="${opacity}" font-size="13" class="watermark-text" text-anchor="middle">
      ${emailParts[0]}
    </text>
    <text x="170" y="108" fill="currentColor" fill-opacity="${opacity}" font-size="13" class="watermark-text" text-anchor="middle">
      ${emailParts[1]}
    </text>
    `
        : `
    <text x="170" y="100" fill="currentColor" fill-opacity="${opacity}" font-size="13.5" class="watermark-text" text-anchor="middle">
      ${safeEmail}
    </text>
    `
    }
    ${
      safeId
        ? `
    <text x="170" y="${isLongEmail && emailParts[1] ? '126' : '120'}" fill="currentColor" fill-opacity="${(opacity * 0.85).toFixed(3)}" font-size="11.5" class="watermark-text" text-anchor="middle">
      ${safeId}
    </text>`
        : ''
    }
  </g>
</svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }, [email, identifier, opacity]);

  return (
    <div
      className="fixed inset-0 pointer-events-none select-none z-30 overflow-hidden text-slate-800 dark:text-slate-100"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${svgDataUrl}")`,
        backgroundRepeat: 'repeat',
        backgroundPosition: 'center center',
      }}
    />
  );
};
