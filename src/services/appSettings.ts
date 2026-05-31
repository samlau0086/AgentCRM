export async function loadAppSettingsFromServer() {
  const response = await fetch("/api/app/settings");
  if (!response.ok) return {};
  const records = await response.json().catch(() => []);
  if (!Array.isArray(records)) return {};
  const settings: Record<string, unknown> = {};
  records.forEach((record) => {
    if (!record?.id) return;
    settings[record.id] = record.value;
    if (typeof record.value === "string") {
      localStorage.setItem(record.id, record.value);
    } else {
      localStorage.setItem(record.id, JSON.stringify(record.value));
    }
  });
  return settings;
}

export async function saveAppSetting(key: string, value: unknown) {
  if (typeof value === "string") {
    localStorage.setItem(key, value);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
  await fetch(`/api/app/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: key, value, updatedAt: new Date().toISOString() }),
  }).catch(console.error);
}
