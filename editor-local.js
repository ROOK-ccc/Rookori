async function applyEditorChange(kind, id, before, edit) {
  const session = await fetch('/editor-session', { cache: 'no-store' });
  if (!session.ok) throw new Error('起動ファイルからエディターを開き直してください。');
  const { token } = await session.json();
  const response = await fetch('/editor-apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Rookori-Editor': token },
    body: JSON.stringify({ kind, id, before: before ?? null, edit }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.edit;
}
