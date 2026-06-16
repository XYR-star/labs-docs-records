export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function imageMarkdown(attachment) {
  const label = attachment.original_name || 'image';
  const url = attachment.url || `/api/attachments/${attachment.id}/file`;
  return `![${label}](${url})`;
}

export function renderEntryBody(value) {
  const source = String(value || '');
  const tokenPattern = /!\[([^\]]*)\]\((\/api\/attachments\/[0-9a-f-]+\/file)\)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (match.index > lastIndex) {
      parts.push(`<p>${escapeHtml(source.slice(lastIndex, match.index)).replaceAll('\n', '<br>')}</p>`);
    }
    parts.push(`
      <figure class="entry-image">
        <img src="${escapeHtml(match[2])}" alt="${escapeHtml(match[1] || '记录图片')}" loading="lazy" />
        ${match[1] ? `<figcaption>${escapeHtml(match[1])}</figcaption>` : ''}
      </figure>
    `);
    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < source.length) {
    parts.push(`<p>${escapeHtml(source.slice(lastIndex)).replaceAll('\n', '<br>')}</p>`);
  }

  return parts.join('') || '<p class="muted-text">暂无正文</p>';
}
